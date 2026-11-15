// Accessible seasonal auditions alongside the original record player.
import { MONTHS, DATASET_NAMES, availableYears, sharedYears, compareMonths, buildPlan, categoryPitch, noteName, differenceText, usable } from './seasonal.js';
import { createSeasonalAudio } from './seasonal-audio.js';
import { readoutText } from './ui-jukebox.js';

const make = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const short = p => p.name.split(',')[0].replace(' and surroundings','');
const download = (content, name, type) => {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const a = make('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),30000);
};

export function initSeasonal(store, data) {
  const $ = id => document.getElementById(id);
  const byPlace = id => data.places.find(p => p.id === id);
  const findDisc = (place,dataset,year) => data.discs.find(d => d.place === place && d.dataset === dataset && d.year === Number(year));
  const options = (select, values, chosen) => {
    select.replaceChildren(...values.map(v => { const o = make('option',v.label ?? String(v)); o.value = String(v.value ?? v); return o; }));
    select.value = values.some(v => String(v.value ?? v) === String(chosen)) ? String(chosen) : String(values[0]?.value ?? values[0] ?? '');
    select.disabled = values.length === 0; return select.value;
  };
  const places = data.places.map(p => ({value:p.id,label:short(p)}));
  options($('record-place'),places,'dhaka');
  options($('compare-place'),places,'dhaka');
  let quickDisc = null, lastQuickDiscId = null;
  function quickDatasets(chosen = $('record-dataset').value) {
    const names = {...DATASET_NAMES,snow:'Snow cover'};
    const available = [...new Set(data.discs.filter(d=>d.place === $('record-place').value).map(d=>d.dataset))];
    options($('record-dataset'),available.map(value=>({value,label:names[value] ?? value})),chosen);
    quickYears();
  }
  function quickYears() {
    const ys = availableYears(data.discs,$('record-place').value,$('record-dataset').value);
    options($('record-year'),ys,$('record-year').value || 2025);
    $('record-load').disabled = !ys.length;
  }
  quickDatasets();
  $('record-place').addEventListener('change',() => quickDatasets());
  $('record-dataset').addEventListener('change',quickYears);
  $('record-load').addEventListener('click',() => {
    const d = findDisc($('record-place').value,$('record-dataset').value,$('record-year').value);
    if (!d) return; store.stop(); store.record(d.id); store.load(d.id);
  });
  $('record-play').addEventListener('click',() => store.state.playing ? store.pause() : store.play());
  $('record-stop').addEventListener('click',() => store.stop());
  $('record-flip').addEventListener('click',() => store.flip());
  $('record-science').addEventListener('click',() => store.setMode(store.state.mode === 'music' ? 'science' : 'music'));
  $('record-details').addEventListener('click',() => $('details-btn').click());
  function syncQuick() {
    quickDisc = store.getDisc(store.state.loadedDisc);
    for (const id of ['record-play','record-stop','record-flip','record-details']) $(id).disabled = !quickDisc;
    $('record-science').setAttribute('aria-pressed',String(store.state.mode === 'science'));
    $('record-play').textContent = store.state.playing ? 'Pause record' : 'Play record';
    if (!quickDisc) { lastQuickDiscId = null; $('record-status').textContent = 'Choose a place above, or pick a disc from the shelf.'; return; }
    // Playback ticks update the readout without replacing a selection being prepared for the next record.
    if (quickDisc.id !== lastQuickDiscId) {
      $('record-place').value = quickDisc.place; quickDatasets(quickDisc.dataset); $('record-year').value = quickDisc.year;
      lastQuickDiscId = quickDisc.id;
    }
    const other = data.discs.find(d => d.place === quickDisc.place && d.dataset === quickDisc.dataset && d.side !== quickDisc.side);
    $('record-flip').disabled = !other; $('record-flip').textContent = other ? `Flip to ${other.year}` : 'One year available';
    $('record-status').textContent = `${short(byPlace(quickDisc.place))} · ${readoutText(quickDisc,Math.floor(store.state.position),data.datasets)} · ${store.state.mode === 'science' ? 'Science' : 'Music'} mode`;
  }
  for (const ev of ['disc:load','flip','play','pause','stop','mode','eject','tick']) store.on(ev,syncQuick);

  let kind = 'years', month = 0, pair = [], currentPlan = null, busy = false, evidence = null, evidencePromise = null;
  let pending = 0;
  const audio = createSeasonalAudio({
    onTick(m,track,status) {
      month = m; updateMonth();
      for (const cell of $('month-grid').children) cell.classList.toggle('is-playing',Number(cell.dataset.month) === month);
      $('compare-status').textContent = `${MONTHS[m]} · ${status === 'unavailable' ? 'Comparison unavailable — silent pair' : kind === 'duet' ? 'Rain + greenness together' : `${track === 0 ? 'A' : 'B'}: ${trackLabel(track)}`}`;
    },
    onEnd() { finish('Finished. Choose any month to listen again.'); },
  });
  audio.setVolume(store.state.settings.volume);
  function finish(text = 'Stopped. Choose a month to inspect it.') {
    busy = false; $('compare-play').textContent = kind === 'duet' ? 'Play the seasonal duet' : 'Play A → B, month by month';
    $('compare-stop').disabled = true;
    $('compare-status').textContent = text;
    for (const cell of $('month-grid').children) cell.classList.remove('is-playing');
  }
  function stop(text) { pending++; audio.stop(); finish(text); }
  for (const ev of ['play','disc:load','flip','eject','stop']) store.on(ev,() => { if (busy) stop('Record controls stopped the comparison.'); });
  store.on('settings',s => { audio.setVolume(s.volume); $('compare-volume').value = s.volume; });
  document.addEventListener('visibilitychange',() => { if (document.hidden && busy) stop('Paused after leaving this tab. Press Play to restart.'); });
  // Keep comparison keyboard actions local instead of triggering the record player's shortcuts.
  $('seasonal').addEventListener('keydown',e => {
    if (e.key === 'Escape') { stop(); e.preventDefault(); }
    if (!['Tab'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
  });

  function trackLabel(i) {
    const d = pair[i]; if (!d) return '';
    if (kind === 'duet') return `${DATASET_NAMES[d.dataset]} · ${d.year}`;
    return `${short(byPlace(d.place))} · ${d.year}`;
  }
  function configure() {
    stop();
    const place = $('compare-place').value;
    const ds = $('compare-dataset').value;
    $('compare-place-b-wrap').hidden = kind !== 'places';
    $('compare-dataset-wrap').hidden = kind === 'duet';
    $('compare-year-b-wrap').hidden = kind !== 'years';
    $('compare-place-label').textContent = kind === 'places' ? 'Place A' : 'Place';
    $('compare-year-label').textContent = kind === 'years' ? 'Year A' : 'Shared year';
    $('duet-mixer').hidden = kind !== 'duet'; $('changes-wrap').hidden = kind === 'duet';
    const otherPlaces = places.filter(p => p.value !== place && availableYears(data.discs,p.value,ds).length);
    options($('compare-place-b'),otherPlaces,$('compare-place-b').value || 'sylhet');
    let years = kind === 'duet' ? sharedYears(data.discs,place) : availableYears(data.discs,place,ds);
    if (kind === 'places') years = years.filter(y => availableYears(data.discs,$('compare-place-b').value,ds).includes(y));
    options($('compare-year'),years,$('compare-year').value || 2025);
    const year = Number($('compare-year').value);
    options($('compare-year-b'),years.filter(y => y !== year),$('compare-year-b').value || 2026);
    pair = kind === 'duet' ? [findDisc(place,'rain',year),findDisc(place,'ndvi',year)] :
      [findDisc(place,ds,year),findDisc(kind === 'places' ? $('compare-place-b').value : place,ds,kind === 'places' ? year : $('compare-year-b').value)];
    for (const button of document.querySelectorAll('[data-season-mode]')) button.setAttribute('aria-pressed',String(button.dataset.seasonMode === kind));
    $('comparison-caveat').textContent = kind === 'duet'
      ? 'Both tracks use the same year and calendar month, but measure different things. Rain is a roughly three-month-smoothed departure from normal; greenness is colour-derived. Shared patterns do not establish cause and effect. Missing or flagged tracks stay silent.'
      : 'Differences are category steps, not exact mm/day or numeric NDVI differences. Equal categories can contain different values. Missing or flagged months are excluded from comparisons; their calendar positions remain visible.';
    render();
  }
  function render() {
    const ready = pair.every(Boolean);
    $('compare-play').disabled = $('hear-month').disabled = $('export-comparison').disabled = $('export-evidence').disabled = !ready;
    $('month-grid').replaceChildren(); $('month-readout').replaceChildren();
    if (!ready) {
      $('comparison-heading').textContent = 'Choose another place or variable.';
      $('comparison-summary').textContent = 'These records do not have a suitable shared year or a second year.';
      $('evidence-content').textContent = 'No matching records selected.'; return;
    }
    currentPlan = buildPlan(...pair,{duet:kind === 'duet',changesOnly:kind !== 'duet' && $('changes-only').checked});
    const comparison = kind === 'duet' ? null : compareMonths(...pair);
    $('comparison-heading').textContent = kind === 'duet' ? `${short(byPlace(pair[0].place))} · ${pair[0].year} · rain + greenness` : `A: ${trackLabel(0)} → B: ${trackLabel(1)} · ${DATASET_NAMES[pair[0].dataset]}`;
    if (comparison) {
      const c = comparison.counts;
      $('comparison-summary').textContent = `${c.changed} changed · ${c.same} same category · ${c.unavailable} unavailable. ${c.compared} of 12 months can be compared.${$('changes-only').checked ? ` Playing only the ${c.changed} changed months (${currentPlan.duration} seconds).` : ' A then B, two seconds per month.'}`;
    } else {
      const counts = pair.map(d => MONTHS.filter((_,m) => usable(d,m)).length);
      $('comparison-summary').textContent = `One place, one year, two seasonal patterns. Rain: ${counts[0]}/12 usable months. Greenness: ${counts[1]}/12. Use the switches to hear each track alone.`;
    }
    $('compare-play').disabled = $('export-comparison').disabled = !currentPlan.duration;
    if (!currentPlan.duration) $('compare-status').textContent = 'No changed comparable months. Turn off “Hear only what changed” to hear the full calendar.';
    for (let m=0;m<12;m++) {
      const button = make('button',undefined,'month-cell'); button.type = 'button'; button.dataset.month = m;
      const row = comparison?.months[m];
      const status = row ? differenceText(row,pair[0].dataset) : 'Inspect both variables';
      button.setAttribute('aria-label',`${MONTHS[m]}. ${status}. Select to inspect; no sound until you press Hear this month.`);
      button.append(make('span',MONTHS[m].slice(0,3),'month-name'));
      for (let t=0;t<2;t++) {
        const d = pair[t], valid = usable(d,m);
        const bar = make('span',undefined,`mini-scale track-${t ? 'b' : 'a'}${valid ? '' : ' missing'}`); bar.setAttribute('aria-hidden','true'); bar.dataset.track = kind === 'duet' ? (t ? 'G' : 'R') : (t ? 'B' : 'A');
        if (valid) { const dot = make('i'); dot.style.left = `${d.dataset === 'rain' ? (d.levels[m]+4)/8*100 : (d.levels[m]-1)/3*100}%`; bar.append(dot); }
        button.append(bar);
      }
      button.append(make('span',row ? (row.status === 'unavailable' ? 'No comparison' : row.delta === 0 ? '= Same' : `${row.delta > 0 ? '↑' : '↓'} ${Math.abs(row.delta)} ${Math.abs(row.delta) === 1 ? 'step' : 'steps'}`) : 'Rain + green','mini-result'));
      button.addEventListener('click',() => { stop(); month = m; updateMonth(); });
      button.addEventListener('keydown',e => {
        const target = e.key === 'ArrowRight' ? Math.min(11,m+1) : e.key === 'ArrowLeft' ? Math.max(0,m-1) : e.key === 'Home' ? 0 : e.key === 'End' ? 11 : null;
        if (target !== null) { e.preventDefault(); stop(); month=target; updateMonth(); $('month-grid').children[target].focus(); }
      });
      $('month-grid').append(button);
    }
    applyMute(); updateMonth();
  }
  function updateMonth() {
    if (!pair.every(Boolean)) return;
    $('selected-month').textContent = MONTHS[month];
    for (const b of $('month-grid').children) b.setAttribute('aria-pressed',String(Number(b.dataset.month) === month));
    $('month-readout').replaceChildren(...pair.map((d,i) => {
      const valid = usable(d,month); const level = d.levels[month];
      const card = make('article',undefined,'reading-card');
      card.append(make('h4',`${kind === 'duet' ? (i ? 'GREENNESS' : 'RAIN') : (i ? 'B' : 'A')} · ${trackLabel(i)}`));
      const label = data.datasets[d.dataset]?.levels.find(l => l.level === level)?.label;
      card.append(make('strong',valid ? label ?? `Category ${level}` : level === null ? 'No observation' : 'Flagged colour match'));
      card.append(make('p',valid ? `Category ${level} → ${noteName(categoryPitch(d.dataset,level))}${d.dataset === 'ndvi' ? ` · ${d.values[month]} on the image colour scale` : ''}` : 'Silent in this audition. No value is substituted.'));
      card.append(make('p',`${d.frames_used?.[month] ?? 'Unknown'} source frames used this month${d.saturated?.[month] ? ' · At the end of the colour scale' : ''}`));
      return card;
    }));
    const both = kind === 'duet' ? pair.some(d => usable(d,month)) : pair.every(d => usable(d,month));
    $('hear-month').disabled = !both;
    $('hear-month').textContent = both ? 'Hear this month' : 'No usable comparison';
    if ($('month-evidence').open) renderEvidence();
  }
  async function play(singleMonth = null) {
    if (!pair.every(Boolean)) return;
    // Stop the console before starting a comparison: the two transports never play over each other.
    store.pause(); audio.stop(); pending++; const token = pending;
    const plan = buildPlan(...pair,{duet:kind === 'duet',changesOnly:singleMonth === null && kind !== 'duet' && $('changes-only').checked,month:singleMonth});
    if (!plan.duration) return;
    busy = true; $('compare-play').textContent = 'Restart audition'; $('compare-stop').disabled = false;
    try { const started = await audio.play(plan); if (token !== pending) return; if (!started) finish(); }
    catch { if (token === pending) finish('Sound could not start. Try Play again, or use the month cards without audio.'); }
  }
  function applyMute() {
    const muted = kind === 'duet' ? [!$('duet-rain').checked,!$('duet-green').checked] : [false,false];
    audio.setMuted(muted);
  }
  async function loadEvidence() {
    if (evidence) return evidence;
    if (!evidencePromise) evidencePromise = fetch('data/seasonal-evidence.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => evidence=d).catch(() => { evidencePromise=null; return null; });
    return evidencePromise;
  }
  async function renderEvidence() {
    const selected = `${pair.map(d => d?.id).join(':')}:${month}`;
    const sources = await loadEvidence();
    if (selected !== `${pair.map(d => d?.id).join(':')}:${month}` || !pair.every(Boolean)) return;
    const columns = make('div',undefined,'evidence-columns');
    pair.forEach((d,i) => {
      const p = byPlace(d.place), source = sources?.discs?.[d.id];
      const panel = make('article'); panel.append(make('h4',`${kind === 'duet' ? DATASET_NAMES[d.dataset] : (i ? 'B' : 'A')} · ${short(p)} · ${MONTHS[month]} ${d.year}`));
      panel.append(make('p',`Sampling centre: ${p.lat.toFixed(4)}°, ${p.lon.toFixed(4)}°. A small regional image window, not an address-level measurement.`));
      const matching = source?.frames.filter(f => Number(f.date.slice(5,7)) === month+1) ?? [];
      const first = matching.find(f => f.sampled_pixels);
      panel.append(make('p',`${d.frames_used?.[month] ?? 'Unknown'} frames used. ${first ? `${first.sampled_pixels} pixels sampled per frame. ` : ''}Whole-disc colour match: ${Math.round(d.match_pct)}%. This checks colour decoding, not physical measurement accuracy.`));
      const link = make('a',`NASA SVS ${d.source?.svs ?? ''} source and method`); link.href=d.source.svs_url; link.target='_blank'; link.rel='noopener'; panel.append(link);
      if (matching.length) {
        const list = make('ul');
        for (const f of matching) {
          const li = make('li');
          if (f.status === 'ok') { const a=make('a',`${f.date} · ${f.match_pct === null ? 'no colour reading' : `${Math.round(f.match_pct)}% colour match`}`); a.href=f.url; a.target='_blank'; a.rel='noopener'; li.append(a); }
          else li.textContent=`${f.date} · ${f.status.replaceAll('_',' ')}`;
          list.append(li);
        }
        panel.append(list);
      } else panel.append(make('p',sources ? 'No per-frame evidence for this record (sample or unavailable data).' : 'Per-frame evidence could not be loaded. The dataset source and stored monthly values remain available.'));
      if (d.frame) { const fig=make('figure'); const img=make('img'); img.src=d.frame; img.alt=`Regional reference image around ${short(p)}, 15 July ${d.year}.`; img.loading='lazy'; fig.append(img,make('figcaption',`Reference image: 15 July ${d.year}. Context only; it does not represent the selected month unless July is selected, and it is not the monthly aggregate.`)); panel.append(fig); }
      columns.append(panel);
    });
    $('evidence-content').replaceChildren(columns);
  }

  document.querySelectorAll('[data-season-mode]').forEach(b => b.addEventListener('click',() => { kind=b.dataset.seasonMode; configure(); }));
  for (const id of ['compare-place','compare-place-b','compare-dataset','compare-year','compare-year-b']) $(id).addEventListener('change',configure);
  $('changes-only').addEventListener('change',() => { stop(); render(); });
  $('compare-play').addEventListener('click',() => play()); $('compare-stop').addEventListener('click',() => stop());
  $('hear-month').addEventListener('click',() => play(month));
  $('compare-volume').addEventListener('input',() => store.updateSettings({volume:Number($('compare-volume').value)}));
  $('duet-rain').addEventListener('change',applyMute); $('duet-green').addEventListener('change',applyMute);
  $('month-evidence').addEventListener('toggle',() => { if ($('month-evidence').open) renderEvidence(); });
  const preset = (next,place,ds) => {
    kind=next; $('compare-place').value=place; $('compare-dataset').value=ds; $('changes-only').checked=false;
    const years=availableYears(data.discs,place,ds); options($('compare-year'),years,years[0]);
    configure(); $('seasonal-title').scrollIntoView({block:'start',behavior:store.state.settings.reducedMotion ? 'instant' : 'smooth'});
  };
  $('preset-years').addEventListener('click',() => preset('years',data.places.some(p=>p.id==='dhaka') ? 'dhaka' : data.places[0].id,'rain'));
  $('preset-places').addEventListener('click',() => { $('compare-place-b').value='sylhet'; preset('places','dhaka','rain'); });
  $('preset-ferlo').hidden = !data.places.some(p=>p.id==='ferlo');
  $('preset-ferlo').addEventListener('click',() => preset('years','ferlo','ndvi'));
  $('export-comparison').addEventListener('click',async () => {
    if (!currentPlan?.duration) return;
    const plan = currentPlan; const name = `earth-jukebox-${kind}-${pair.map(d=>d.id).join('-')}${$('changes-only').checked && kind !== 'duet' ? '-changes' : ''}`;
    $('export-comparison').disabled = true; $('export-status').textContent='Preparing audio…';
    try { download(await audio.export(plan),`${name}.wav`,'audio/wav'); $('export-status').textContent=`Downloaded ${plan.duration} seconds. Export its data for the source record.`; }
    catch (err) { $('export-status').textContent=err.message; }
    finally { $('export-comparison').disabled=!currentPlan?.duration; }
  });
  $('export-evidence').addEventListener('click',async () => {
    const selectedPair=[...pair]; const plan=currentPlan; const mode=kind;
    const muted=mode==='duet' ? [!$('duet-rain').checked,!$('duet-green').checked] : [false,false];
    const volume=store.state.settings.volume; const src=await loadEvidence();
    if (!selectedPair.every(Boolean)) return;
    const result={product:'Earth Jukebox',mode,meaning:'Category auditions from NASA rendered images; not exact rainfall differences or calibrated numeric NDVI. Silent pairs are not zero.',
      plan,volume,records:selectedPair.map(d=>({disc:d,place:byPlace(d.place),evidence:src?.discs?.[d.id] ?? null})),muted};
    download(JSON.stringify(result,null,2),'earth-jukebox-audition-evidence.json','application/json'); $('export-status').textContent='Downloaded the note plan, monthly values and available source evidence.';
  });
  configure(); syncQuick();
  return { stop };
}
