/** Unsupported constraints are omitted; supported constraints are requests, not hardware guarantees. */
export function instrumentAudioConstraints(supported: MediaTrackSupportedConstraints): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {};
  if (supported.echoCancellation) audio.echoCancellation = false;
  if (supported.noiseSuppression) audio.noiseSuppression = false;
  if (supported.autoGainControl) audio.autoGainControl = false;
  if (supported.channelCount) audio.channelCount = 1;
  if (supported.sampleRate) audio.sampleRate = { ideal: 48000 };
  return { audio: Object.keys(audio).length ? audio : true };
}
