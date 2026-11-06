// 🧩 Dump SmokeSequence.js / InspectorPages.js numbers for C++ parity.
import { GasParameterCatalogue, ConstructGasParameters, MapPlumeSettings } from
    '../../Experimental/VehicleHmiPrototype/Source/SmokeSequence.js';
import { PlumeDefaults, PlumeGrades } from
    '../../Experimental/VehicleHmiPrototype/Source/PlumeSpace.js';

const Gas = ConstructGasParameters();
const Mapped = MapPlumeSettings(Gas, true);
const Catalogue = Object.entries(GasParameterCatalogue).map(([Key, Value]) => ({ Key, ...Value }));
console.log(JSON.stringify({
    CatalogueCount: Catalogue.length,
    Defaults: Gas,
    Mapped,
    FlameDecay: Mapped.PlumeFlameDecay,
    PlumeDefaults,
    Grades: PlumeGrades
}, null, 2));
