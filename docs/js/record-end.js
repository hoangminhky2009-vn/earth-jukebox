/** Return a finished record to the shelf unless the listener starts another action. */
export function bindRecordEnd(store, audio, { announce, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let ejectTimer = null;
  const cancelEject = () => {
    if (ejectTimer !== null) clearTimer(ejectTimer);
    ejectTimer = null;
  };
  // A comparison pauses the record first. That handoff must also cancel the delayed eject,
  // because ejecting would stop the newly started comparison through the shared store.
  for (const event of ['play', 'pause', 'stop', 'seek', 'flip', 'disc:load', 'eject']) {
    store.on(event, cancelEject);
  }
  audio.onEnd?.(() => {
    cancelEject();
    const discId = store.state.loadedDisc;
    if (!discId) return;
    store.stop();
    announce('End of the year. The disc goes back on the shelf.');
    ejectTimer = setTimer(() => {
      ejectTimer = null;
      if (store.state.loadedDisc === discId && !store.state.playing) store.eject();
    }, 1200);
  });
}
