# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
from pathlib import Path
import numpy as np
from PIL import Image
import pytest
from pipeline.run import build_discs, merge_export, merge_evidence, assert_light_window_clear


PLACE = {'id':'dhaka','name':'Dhaka','lat':23.81,'lon':90.41,
         'biome':'monsoon-delta','region':'south-asia','story':''}


def manifest(tmp_path):
    path = tmp_path / 'test.png'
    pixels = np.zeros((180,360,4), dtype=np.uint8)
    # Transparent rain means near normal regardless of hidden RGB.
    pixels[:,:,:3] = [242,226,185]
    Image.fromarray(pixels).save(path)
    return {'dataset':'rain','year':2025,'sample_days':[1,8,15,22,28],
            'folder':'https://svs.gsfc.nasa.gov/example/','variant':'full',
            'frames':{f'2025-01-{d:02}':{'status':'ok','path':str(path),'url':'https://svs.gsfc.nasa.gov/test.png'} for d in [1,8,15,22,28]}}


def test_no_invented_months_or_gaps(tmp_path):
    source = manifest(tmp_path)
    source['frames']['2025-02-01'] = {'status':'not_yet_published'}
    source['frames']['2025-03-01'] = {'status':'future'}
    discs, evidence = build_discs(source, [PLACE])
    disc = discs[0]
    assert disc['levels'] == [0] + [None]*11
    assert disc['frames_used'] == [5]+[0]*11
    assert disc['breaks'] == []
    assert disc['condition'] == 'scratched'
    assert evidence['dhaka']['quality']['opaque_matched_pixels'] == 0


def test_only_archive_gaps_become_breaks(tmp_path):
    source = manifest(tmp_path)
    source['frames']['2025-01-28'] = {'status':'archive_gap'}
    discs, _ = build_discs(source, [PLACE])
    assert discs[0]['levels'][0] == 0
    assert discs[0]['breaks'] == [1]
    assert discs[0]['condition'] == 'skips'


def test_network_failure_is_not_scientific_missing_data(tmp_path):
    source = manifest(tmp_path)
    source['frames']['2025-01-28'] = {'status':'download_failed'}
    with pytest.raises(ValueError, match='Download failed'):
        build_discs(source, [PLACE])


def test_real_export_preserves_unrelated_discs_and_replaces_same_id():
    old = {'version':1,'places':[PLACE], 'discs':[{'id':'first','levels':[0],'description':'Reviewed text','check':None},{'id':'other'}]}
    data = merge_export(old,[PLACE],[{'id':'first','levels':[1],'description':'','check':None}])
    assert data['discs'] == [{'id':'first','levels':[1],'description':'Reviewed text','check':None},{'id':'other'}]
    assert data.get('fake') is not True
    with pytest.raises(ValueError,match='fake'):
        merge_export({'fake':True},[PLACE],[])


def test_export_preserves_reviewed_place_story_and_additive_fields():
    old = {'places':[{**PLACE,'story':'Reviewed story','extra':'keep'}],'discs':[]}
    data = merge_export(old,[PLACE],[])
    assert data['places'][0]['story'] == 'Reviewed story'
    assert data['places'][0]['extra'] == 'keep'


def test_single_place_rerun_keeps_other_evidence():
    old = {'places':{'first':{'quality':1},'other':{'quality':2}}}
    result = merge_evidence(old,{'first':{'quality':3}})
    assert result == {'first':{'quality':3},'other':{'quality':2}}


def test_ndvi_light_overlay_is_never_sampled_as_vegetation():
    assert_light_window_clear(23.81,90.41,4096,2048)
    with pytest.raises(ValueError,match='date label'):
        assert_light_window_clear(-80,-170,4096,2048)
    with pytest.raises(ValueError,match='dimensions'):
        assert_light_window_clear(23.81,90.41,2048,1024)


def test_rain_crop_uses_the_verified_geographic_origin(tmp_path, monkeypatch):
    import pipeline.run as run
    pixels = np.zeros((1800,3600,3),dtype=np.uint8)
    pixels[659:664,702:707] = [102,187,177]
    pixels[659:664,2702:2707] = [84,48,2]
    source = tmp_path/'source.png'
    Image.fromarray(pixels).save(source)
    monkeypatch.setattr(run,'ROOT',tmp_path)
    monkeypatch.setattr(run,'CACHE',tmp_path/'cache')
    listing = tmp_path/'cache/listings/rain-composite.html'
    listing.parent.mkdir(parents=True)
    listing.write_text('<a href="imergvar_composite.2025.07.15.png">frame</a>')
    monkeypatch.setattr(run,'download',lambda url,path:{'path':str(source),'url':url,'sha256':'test'})
    manifest = {'frames':{'2025-07-15':{'status':'ok'}}}
    disc = {'id':'dhaka-rain-2025','dataset':'rain','year':2025,'frame':'data/frames/test.png'}
    evidence = run.make_crop(manifest,PLACE,disc)
    with Image.open(tmp_path/'docs/data/frames/test.png') as crop:
        assert crop.getpixel((128,128)) == (102,187,177)
    assert evidence['centre_pixel'] == [704,661]
    assert evidence['west_lon'] == 20
    assert evidence['bounds'] == {'west':77.6,'east':103.2,'north':36.7,'south':11.1}
