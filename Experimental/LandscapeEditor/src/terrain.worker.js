// Runs the layer stack off the UI thread. Each request carries an id; the UI ignores stale replies.
import { evaluateStack } from './terrain/pipeline.js';

self.onmessage = (event) => {
  const { id, layers, settings } = event.data;
  try {
    const result = evaluateStack(layers, settings, (step, total, name) => {
      self.postMessage({ id, progress: { step, total, name } });
    });
    const transfer = [
      result.height.buffer,
      result.erosion.buffer,
      result.deposit.buffer,
      result.flow.buffer,
      result.slope.buffer,
      result.curvature.buffer,
    ];
    const log = result.log.map(({ profile, ...rest }) => ({ ...rest, profile }));
    for (const entry of log) transfer.push(entry.profile.buffer);
    self.postMessage({
      id,
      result: {
        n: result.n,
        cs: result.cs,
        seaLevel: result.seaLevel,
        height: result.height,
        erosion: result.erosion,
        deposit: result.deposit,
        flow: result.flow,
        slope: result.slope,
        curvature: result.curvature,
        log,
      },
    }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String((error && error.stack) || error) });
  }
};
