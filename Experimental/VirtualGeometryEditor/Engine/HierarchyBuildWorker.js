// Module worker: constructs a source polygon network and builds its cluster hierarchy off
// the UI thread. Messages in:  { RequestId, Generator, GeneratorOptions, Source?, BuildOptions }
// Messages out: { RequestId, Progress: { Phase, Fraction } } and { RequestId, Asset } | { RequestId, Failure }.

import { SourceGenerators } from "./PolygonNetworkSources.js";
import { BuildClusterHierarchy, EnumerateTransferBuffers } from "./ClusterHierarchyBuilder.js";

self.onmessage = (Message) => {
    const { RequestId, Generator, GeneratorOptions, Source, BuildOptions } = Message.data;
    try {
        const Started = performance.now();
        let Network = Source;
        if (!Network) {
            const Construct = SourceGenerators[Generator];
            if (!Construct) throw new Error(`Unknown generator ${Generator}`);
            Network = Construct(GeneratorOptions || {});
        }
        const Asset = BuildClusterHierarchy(Network, BuildOptions || {}, (Phase, Fraction) => {
            self.postMessage({ RequestId, Progress: { Phase, Fraction } });
        });
        Asset.BuildMilliseconds = performance.now() - Started;
        self.postMessage({ RequestId, Asset }, EnumerateTransferBuffers(Asset));
    } catch (Failure) {
        self.postMessage({ RequestId, Failure: String(Failure && Failure.stack || Failure) });
    }
};
