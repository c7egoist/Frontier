(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/react/cjs/react.production.min.js
  var require_react_production_min = __commonJS({
    "node_modules/react/cjs/react.production.min.js"(exports) {
      "use strict";
      var l = Symbol.for("react.element");
      var n = Symbol.for("react.portal");
      var p = Symbol.for("react.fragment");
      var q = Symbol.for("react.strict_mode");
      var r = Symbol.for("react.profiler");
      var t = Symbol.for("react.provider");
      var u = Symbol.for("react.context");
      var v = Symbol.for("react.forward_ref");
      var w = Symbol.for("react.suspense");
      var x = Symbol.for("react.memo");
      var y = Symbol.for("react.lazy");
      var z = Symbol.iterator;
      function A(a) {
        if (null === a || "object" !== typeof a) return null;
        a = z && a[z] || a["@@iterator"];
        return "function" === typeof a ? a : null;
      }
      var B = { isMounted: function() {
        return false;
      }, enqueueForceUpdate: function() {
      }, enqueueReplaceState: function() {
      }, enqueueSetState: function() {
      } };
      var C = Object.assign;
      var D = {};
      function E(a, b, e) {
        this.props = a;
        this.context = b;
        this.refs = D;
        this.updater = e || B;
      }
      E.prototype.isReactComponent = {};
      E.prototype.setState = function(a, b) {
        if ("object" !== typeof a && "function" !== typeof a && null != a) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
        this.updater.enqueueSetState(this, a, b, "setState");
      };
      E.prototype.forceUpdate = function(a) {
        this.updater.enqueueForceUpdate(this, a, "forceUpdate");
      };
      function F() {
      }
      F.prototype = E.prototype;
      function G(a, b, e) {
        this.props = a;
        this.context = b;
        this.refs = D;
        this.updater = e || B;
      }
      var H = G.prototype = new F();
      H.constructor = G;
      C(H, E.prototype);
      H.isPureReactComponent = true;
      var I = Array.isArray;
      var J = Object.prototype.hasOwnProperty;
      var K = { current: null };
      var L2 = { key: true, ref: true, __self: true, __source: true };
      function M2(a, b, e) {
        var d, c = {}, k = null, h = null;
        if (null != b) for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k = "" + b.key), b) J.call(b, d) && !L2.hasOwnProperty(d) && (c[d] = b[d]);
        var g = arguments.length - 2;
        if (1 === g) c.children = e;
        else if (1 < g) {
          for (var f = Array(g), m = 0; m < g; m++) f[m] = arguments[m + 2];
          c.children = f;
        }
        if (a && a.defaultProps) for (d in g = a.defaultProps, g) void 0 === c[d] && (c[d] = g[d]);
        return { $$typeof: l, type: a, key: k, ref: h, props: c, _owner: K.current };
      }
      function N(a, b) {
        return { $$typeof: l, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
      }
      function O(a) {
        return "object" === typeof a && null !== a && a.$$typeof === l;
      }
      function escape(a) {
        var b = { "=": "=0", ":": "=2" };
        return "$" + a.replace(/[=:]/g, function(a2) {
          return b[a2];
        });
      }
      var P = /\/+/g;
      function Q(a, b) {
        return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b.toString(36);
      }
      function R(a, b, e, d, c) {
        var k = typeof a;
        if ("undefined" === k || "boolean" === k) a = null;
        var h = false;
        if (null === a) h = true;
        else switch (k) {
          case "string":
          case "number":
            h = true;
            break;
          case "object":
            switch (a.$$typeof) {
              case l:
              case n:
                h = true;
            }
        }
        if (h) return h = a, c = c(h), a = "" === d ? "." + Q(h, 0) : d, I(c) ? (e = "", null != a && (e = a.replace(P, "$&/") + "/"), R(c, b, e, "", function(a2) {
          return a2;
        })) : null != c && (O(c) && (c = N(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
        h = 0;
        d = "" === d ? "." : d + ":";
        if (I(a)) for (var g = 0; g < a.length; g++) {
          k = a[g];
          var f = d + Q(k, g);
          h += R(k, b, e, f, c);
        }
        else if (f = A(a), "function" === typeof f) for (a = f.call(a), g = 0; !(k = a.next()).done; ) k = k.value, f = d + Q(k, g++), h += R(k, b, e, f, c);
        else if ("object" === k) throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
        return h;
      }
      function S(a, b, e) {
        if (null == a) return a;
        var d = [], c = 0;
        R(a, d, "", "", function(a2) {
          return b.call(e, a2, c++);
        });
        return d;
      }
      function T(a) {
        if (-1 === a._status) {
          var b = a._result;
          b = b();
          b.then(function(b2) {
            if (0 === a._status || -1 === a._status) a._status = 1, a._result = b2;
          }, function(b2) {
            if (0 === a._status || -1 === a._status) a._status = 2, a._result = b2;
          });
          -1 === a._status && (a._status = 0, a._result = b);
        }
        if (1 === a._status) return a._result.default;
        throw a._result;
      }
      var U = { current: null };
      var V = { transition: null };
      var W = { ReactCurrentDispatcher: U, ReactCurrentBatchConfig: V, ReactCurrentOwner: K };
      function X() {
        throw Error("act(...) is not supported in production builds of React.");
      }
      exports.Children = { map: S, forEach: function(a, b, e) {
        S(a, function() {
          b.apply(this, arguments);
        }, e);
      }, count: function(a) {
        var b = 0;
        S(a, function() {
          b++;
        });
        return b;
      }, toArray: function(a) {
        return S(a, function(a2) {
          return a2;
        }) || [];
      }, only: function(a) {
        if (!O(a)) throw Error("React.Children.only expected to receive a single React element child.");
        return a;
      } };
      exports.Component = E;
      exports.Fragment = p;
      exports.Profiler = r;
      exports.PureComponent = G;
      exports.StrictMode = q;
      exports.Suspense = w;
      exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
      exports.act = X;
      exports.cloneElement = function(a, b, e) {
        if (null === a || void 0 === a) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
        var d = C({}, a.props), c = a.key, k = a.ref, h = a._owner;
        if (null != b) {
          void 0 !== b.ref && (k = b.ref, h = K.current);
          void 0 !== b.key && (c = "" + b.key);
          if (a.type && a.type.defaultProps) var g = a.type.defaultProps;
          for (f in b) J.call(b, f) && !L2.hasOwnProperty(f) && (d[f] = void 0 === b[f] && void 0 !== g ? g[f] : b[f]);
        }
        var f = arguments.length - 2;
        if (1 === f) d.children = e;
        else if (1 < f) {
          g = Array(f);
          for (var m = 0; m < f; m++) g[m] = arguments[m + 2];
          d.children = g;
        }
        return { $$typeof: l, type: a.type, key: c, ref: k, props: d, _owner: h };
      };
      exports.createContext = function(a) {
        a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
        a.Provider = { $$typeof: t, _context: a };
        return a.Consumer = a;
      };
      exports.createElement = M2;
      exports.createFactory = function(a) {
        var b = M2.bind(null, a);
        b.type = a;
        return b;
      };
      exports.createRef = function() {
        return { current: null };
      };
      exports.forwardRef = function(a) {
        return { $$typeof: v, render: a };
      };
      exports.isValidElement = O;
      exports.lazy = function(a) {
        return { $$typeof: y, _payload: { _status: -1, _result: a }, _init: T };
      };
      exports.memo = function(a, b) {
        return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
      };
      exports.startTransition = function(a) {
        var b = V.transition;
        V.transition = {};
        try {
          a();
        } finally {
          V.transition = b;
        }
      };
      exports.unstable_act = X;
      exports.useCallback = function(a, b) {
        return U.current.useCallback(a, b);
      };
      exports.useContext = function(a) {
        return U.current.useContext(a);
      };
      exports.useDebugValue = function() {
      };
      exports.useDeferredValue = function(a) {
        return U.current.useDeferredValue(a);
      };
      exports.useEffect = function(a, b) {
        return U.current.useEffect(a, b);
      };
      exports.useId = function() {
        return U.current.useId();
      };
      exports.useImperativeHandle = function(a, b, e) {
        return U.current.useImperativeHandle(a, b, e);
      };
      exports.useInsertionEffect = function(a, b) {
        return U.current.useInsertionEffect(a, b);
      };
      exports.useLayoutEffect = function(a, b) {
        return U.current.useLayoutEffect(a, b);
      };
      exports.useMemo = function(a, b) {
        return U.current.useMemo(a, b);
      };
      exports.useReducer = function(a, b, e) {
        return U.current.useReducer(a, b, e);
      };
      exports.useRef = function(a) {
        return U.current.useRef(a);
      };
      exports.useState = function(a) {
        return U.current.useState(a);
      };
      exports.useSyncExternalStore = function(a, b, e) {
        return U.current.useSyncExternalStore(a, b, e);
      };
      exports.useTransition = function() {
        return U.current.useTransition();
      };
      exports.version = "18.3.1";
    }
  });

  // node_modules/react/index.js
  var require_react = __commonJS({
    "node_modules/react/index.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_react_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // node_modules/scheduler/cjs/scheduler.production.min.js
  var require_scheduler_production_min = __commonJS({
    "node_modules/scheduler/cjs/scheduler.production.min.js"(exports) {
      "use strict";
      function f(a, b) {
        var c = a.length;
        a.push(b);
        a: for (; 0 < c; ) {
          var d = c - 1 >>> 1, e = a[d];
          if (0 < g(e, b)) a[d] = b, a[c] = e, c = d;
          else break a;
        }
      }
      function h(a) {
        return 0 === a.length ? null : a[0];
      }
      function k(a) {
        if (0 === a.length) return null;
        var b = a[0], c = a.pop();
        if (c !== b) {
          a[0] = c;
          a: for (var d = 0, e = a.length, w = e >>> 1; d < w; ) {
            var m = 2 * (d + 1) - 1, C = a[m], n = m + 1, x = a[n];
            if (0 > g(C, c)) n < e && 0 > g(x, C) ? (a[d] = x, a[n] = c, d = n) : (a[d] = C, a[m] = c, d = m);
            else if (n < e && 0 > g(x, c)) a[d] = x, a[n] = c, d = n;
            else break a;
          }
        }
        return b;
      }
      function g(a, b) {
        var c = a.sortIndex - b.sortIndex;
        return 0 !== c ? c : a.id - b.id;
      }
      if ("object" === typeof performance && "function" === typeof performance.now) {
        l = performance;
        exports.unstable_now = function() {
          return l.now();
        };
      } else {
        p = Date, q = p.now();
        exports.unstable_now = function() {
          return p.now() - q;
        };
      }
      var l;
      var p;
      var q;
      var r = [];
      var t = [];
      var u = 1;
      var v = null;
      var y = 3;
      var z = false;
      var A = false;
      var B = false;
      var D = "function" === typeof setTimeout ? setTimeout : null;
      var E = "function" === typeof clearTimeout ? clearTimeout : null;
      var F = "undefined" !== typeof setImmediate ? setImmediate : null;
      "undefined" !== typeof navigator && void 0 !== navigator.scheduling && void 0 !== navigator.scheduling.isInputPending && navigator.scheduling.isInputPending.bind(navigator.scheduling);
      function G(a) {
        for (var b = h(t); null !== b; ) {
          if (null === b.callback) k(t);
          else if (b.startTime <= a) k(t), b.sortIndex = b.expirationTime, f(r, b);
          else break;
          b = h(t);
        }
      }
      function H(a) {
        B = false;
        G(a);
        if (!A) if (null !== h(r)) A = true, I(J);
        else {
          var b = h(t);
          null !== b && K(H, b.startTime - a);
        }
      }
      function J(a, b) {
        A = false;
        B && (B = false, E(L2), L2 = -1);
        z = true;
        var c = y;
        try {
          G(b);
          for (v = h(r); null !== v && (!(v.expirationTime > b) || a && !M2()); ) {
            var d = v.callback;
            if ("function" === typeof d) {
              v.callback = null;
              y = v.priorityLevel;
              var e = d(v.expirationTime <= b);
              b = exports.unstable_now();
              "function" === typeof e ? v.callback = e : v === h(r) && k(r);
              G(b);
            } else k(r);
            v = h(r);
          }
          if (null !== v) var w = true;
          else {
            var m = h(t);
            null !== m && K(H, m.startTime - b);
            w = false;
          }
          return w;
        } finally {
          v = null, y = c, z = false;
        }
      }
      var N = false;
      var O = null;
      var L2 = -1;
      var P = 5;
      var Q = -1;
      function M2() {
        return exports.unstable_now() - Q < P ? false : true;
      }
      function R() {
        if (null !== O) {
          var a = exports.unstable_now();
          Q = a;
          var b = true;
          try {
            b = O(true, a);
          } finally {
            b ? S() : (N = false, O = null);
          }
        } else N = false;
      }
      var S;
      if ("function" === typeof F) S = function() {
        F(R);
      };
      else if ("undefined" !== typeof MessageChannel) {
        T = new MessageChannel(), U = T.port2;
        T.port1.onmessage = R;
        S = function() {
          U.postMessage(null);
        };
      } else S = function() {
        D(R, 0);
      };
      var T;
      var U;
      function I(a) {
        O = a;
        N || (N = true, S());
      }
      function K(a, b) {
        L2 = D(function() {
          a(exports.unstable_now());
        }, b);
      }
      exports.unstable_IdlePriority = 5;
      exports.unstable_ImmediatePriority = 1;
      exports.unstable_LowPriority = 4;
      exports.unstable_NormalPriority = 3;
      exports.unstable_Profiling = null;
      exports.unstable_UserBlockingPriority = 2;
      exports.unstable_cancelCallback = function(a) {
        a.callback = null;
      };
      exports.unstable_continueExecution = function() {
        A || z || (A = true, I(J));
      };
      exports.unstable_forceFrameRate = function(a) {
        0 > a || 125 < a ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : P = 0 < a ? Math.floor(1e3 / a) : 5;
      };
      exports.unstable_getCurrentPriorityLevel = function() {
        return y;
      };
      exports.unstable_getFirstCallbackNode = function() {
        return h(r);
      };
      exports.unstable_next = function(a) {
        switch (y) {
          case 1:
          case 2:
          case 3:
            var b = 3;
            break;
          default:
            b = y;
        }
        var c = y;
        y = b;
        try {
          return a();
        } finally {
          y = c;
        }
      };
      exports.unstable_pauseExecution = function() {
      };
      exports.unstable_requestPaint = function() {
      };
      exports.unstable_runWithPriority = function(a, b) {
        switch (a) {
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
            break;
          default:
            a = 3;
        }
        var c = y;
        y = a;
        try {
          return b();
        } finally {
          y = c;
        }
      };
      exports.unstable_scheduleCallback = function(a, b, c) {
        var d = exports.unstable_now();
        "object" === typeof c && null !== c ? (c = c.delay, c = "number" === typeof c && 0 < c ? d + c : d) : c = d;
        switch (a) {
          case 1:
            var e = -1;
            break;
          case 2:
            e = 250;
            break;
          case 5:
            e = 1073741823;
            break;
          case 4:
            e = 1e4;
            break;
          default:
            e = 5e3;
        }
        e = c + e;
        a = { id: u++, callback: b, priorityLevel: a, startTime: c, expirationTime: e, sortIndex: -1 };
        c > d ? (a.sortIndex = c, f(t, a), null === h(r) && a === h(t) && (B ? (E(L2), L2 = -1) : B = true, K(H, c - d))) : (a.sortIndex = e, f(r, a), A || z || (A = true, I(J)));
        return a;
      };
      exports.unstable_shouldYield = M2;
      exports.unstable_wrapCallback = function(a) {
        var b = y;
        return function() {
          var c = y;
          y = b;
          try {
            return a.apply(this, arguments);
          } finally {
            y = c;
          }
        };
      };
    }
  });

  // node_modules/scheduler/index.js
  var require_scheduler = __commonJS({
    "node_modules/scheduler/index.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_scheduler_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // node_modules/react-dom/cjs/react-dom.production.min.js
  var require_react_dom_production_min = __commonJS({
    "node_modules/react-dom/cjs/react-dom.production.min.js"(exports) {
      "use strict";
      var aa = require_react();
      var ca = require_scheduler();
      function p(a) {
        for (var b = "https://reactjs.org/docs/error-decoder.html?invariant=" + a, c = 1; c < arguments.length; c++) b += "&args[]=" + encodeURIComponent(arguments[c]);
        return "Minified React error #" + a + "; visit " + b + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
      }
      var da = /* @__PURE__ */ new Set();
      var ea = {};
      function fa(a, b) {
        ha(a, b);
        ha(a + "Capture", b);
      }
      function ha(a, b) {
        ea[a] = b;
        for (a = 0; a < b.length; a++) da.add(b[a]);
      }
      var ia = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement);
      var ja = Object.prototype.hasOwnProperty;
      var ka = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/;
      var la = {};
      var ma = {};
      function oa(a) {
        if (ja.call(ma, a)) return true;
        if (ja.call(la, a)) return false;
        if (ka.test(a)) return ma[a] = true;
        la[a] = true;
        return false;
      }
      function pa(a, b, c, d) {
        if (null !== c && 0 === c.type) return false;
        switch (typeof b) {
          case "function":
          case "symbol":
            return true;
          case "boolean":
            if (d) return false;
            if (null !== c) return !c.acceptsBooleans;
            a = a.toLowerCase().slice(0, 5);
            return "data-" !== a && "aria-" !== a;
          default:
            return false;
        }
      }
      function qa(a, b, c, d) {
        if (null === b || "undefined" === typeof b || pa(a, b, c, d)) return true;
        if (d) return false;
        if (null !== c) switch (c.type) {
          case 3:
            return !b;
          case 4:
            return false === b;
          case 5:
            return isNaN(b);
          case 6:
            return isNaN(b) || 1 > b;
        }
        return false;
      }
      function v(a, b, c, d, e, f, g) {
        this.acceptsBooleans = 2 === b || 3 === b || 4 === b;
        this.attributeName = d;
        this.attributeNamespace = e;
        this.mustUseProperty = c;
        this.propertyName = a;
        this.type = b;
        this.sanitizeURL = f;
        this.removeEmptyString = g;
      }
      var z = {};
      "children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a) {
        z[a] = new v(a, 0, false, a, null, false, false);
      });
      [["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(a) {
        var b = a[0];
        z[b] = new v(b, 1, false, a[1], null, false, false);
      });
      ["contentEditable", "draggable", "spellCheck", "value"].forEach(function(a) {
        z[a] = new v(a, 2, false, a.toLowerCase(), null, false, false);
      });
      ["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(a) {
        z[a] = new v(a, 2, false, a, null, false, false);
      });
      "allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a) {
        z[a] = new v(a, 3, false, a.toLowerCase(), null, false, false);
      });
      ["checked", "multiple", "muted", "selected"].forEach(function(a) {
        z[a] = new v(a, 3, true, a, null, false, false);
      });
      ["capture", "download"].forEach(function(a) {
        z[a] = new v(a, 4, false, a, null, false, false);
      });
      ["cols", "rows", "size", "span"].forEach(function(a) {
        z[a] = new v(a, 6, false, a, null, false, false);
      });
      ["rowSpan", "start"].forEach(function(a) {
        z[a] = new v(a, 5, false, a.toLowerCase(), null, false, false);
      });
      var ra = /[\-:]([a-z])/g;
      function sa(a) {
        return a[1].toUpperCase();
      }
      "accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a) {
        var b = a.replace(
          ra,
          sa
        );
        z[b] = new v(b, 1, false, a, null, false, false);
      });
      "xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a) {
        var b = a.replace(ra, sa);
        z[b] = new v(b, 1, false, a, "http://www.w3.org/1999/xlink", false, false);
      });
      ["xml:base", "xml:lang", "xml:space"].forEach(function(a) {
        var b = a.replace(ra, sa);
        z[b] = new v(b, 1, false, a, "http://www.w3.org/XML/1998/namespace", false, false);
      });
      ["tabIndex", "crossOrigin"].forEach(function(a) {
        z[a] = new v(a, 1, false, a.toLowerCase(), null, false, false);
      });
      z.xlinkHref = new v("xlinkHref", 1, false, "xlink:href", "http://www.w3.org/1999/xlink", true, false);
      ["src", "href", "action", "formAction"].forEach(function(a) {
        z[a] = new v(a, 1, false, a.toLowerCase(), null, true, true);
      });
      function ta(a, b, c, d) {
        var e = z.hasOwnProperty(b) ? z[b] : null;
        if (null !== e ? 0 !== e.type : d || !(2 < b.length) || "o" !== b[0] && "O" !== b[0] || "n" !== b[1] && "N" !== b[1]) qa(b, c, e, d) && (c = null), d || null === e ? oa(b) && (null === c ? a.removeAttribute(b) : a.setAttribute(b, "" + c)) : e.mustUseProperty ? a[e.propertyName] = null === c ? 3 === e.type ? false : "" : c : (b = e.attributeName, d = e.attributeNamespace, null === c ? a.removeAttribute(b) : (e = e.type, c = 3 === e || 4 === e && true === c ? "" : "" + c, d ? a.setAttributeNS(d, b, c) : a.setAttribute(b, c)));
      }
      var ua = aa.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
      var va = Symbol.for("react.element");
      var wa = Symbol.for("react.portal");
      var ya = Symbol.for("react.fragment");
      var za = Symbol.for("react.strict_mode");
      var Aa = Symbol.for("react.profiler");
      var Ba = Symbol.for("react.provider");
      var Ca = Symbol.for("react.context");
      var Da = Symbol.for("react.forward_ref");
      var Ea = Symbol.for("react.suspense");
      var Fa = Symbol.for("react.suspense_list");
      var Ga = Symbol.for("react.memo");
      var Ha = Symbol.for("react.lazy");
      Symbol.for("react.scope");
      Symbol.for("react.debug_trace_mode");
      var Ia = Symbol.for("react.offscreen");
      Symbol.for("react.legacy_hidden");
      Symbol.for("react.cache");
      Symbol.for("react.tracing_marker");
      var Ja = Symbol.iterator;
      function Ka(a) {
        if (null === a || "object" !== typeof a) return null;
        a = Ja && a[Ja] || a["@@iterator"];
        return "function" === typeof a ? a : null;
      }
      var A = Object.assign;
      var La;
      function Ma(a) {
        if (void 0 === La) try {
          throw Error();
        } catch (c) {
          var b = c.stack.trim().match(/\n( *(at )?)/);
          La = b && b[1] || "";
        }
        return "\n" + La + a;
      }
      var Na = false;
      function Oa(a, b) {
        if (!a || Na) return "";
        Na = true;
        var c = Error.prepareStackTrace;
        Error.prepareStackTrace = void 0;
        try {
          if (b) if (b = function() {
            throw Error();
          }, Object.defineProperty(b.prototype, "props", { set: function() {
            throw Error();
          } }), "object" === typeof Reflect && Reflect.construct) {
            try {
              Reflect.construct(b, []);
            } catch (l) {
              var d = l;
            }
            Reflect.construct(a, [], b);
          } else {
            try {
              b.call();
            } catch (l) {
              d = l;
            }
            a.call(b.prototype);
          }
          else {
            try {
              throw Error();
            } catch (l) {
              d = l;
            }
            a();
          }
        } catch (l) {
          if (l && d && "string" === typeof l.stack) {
            for (var e = l.stack.split("\n"), f = d.stack.split("\n"), g = e.length - 1, h = f.length - 1; 1 <= g && 0 <= h && e[g] !== f[h]; ) h--;
            for (; 1 <= g && 0 <= h; g--, h--) if (e[g] !== f[h]) {
              if (1 !== g || 1 !== h) {
                do
                  if (g--, h--, 0 > h || e[g] !== f[h]) {
                    var k = "\n" + e[g].replace(" at new ", " at ");
                    a.displayName && k.includes("<anonymous>") && (k = k.replace("<anonymous>", a.displayName));
                    return k;
                  }
                while (1 <= g && 0 <= h);
              }
              break;
            }
          }
        } finally {
          Na = false, Error.prepareStackTrace = c;
        }
        return (a = a ? a.displayName || a.name : "") ? Ma(a) : "";
      }
      function Pa(a) {
        switch (a.tag) {
          case 5:
            return Ma(a.type);
          case 16:
            return Ma("Lazy");
          case 13:
            return Ma("Suspense");
          case 19:
            return Ma("SuspenseList");
          case 0:
          case 2:
          case 15:
            return a = Oa(a.type, false), a;
          case 11:
            return a = Oa(a.type.render, false), a;
          case 1:
            return a = Oa(a.type, true), a;
          default:
            return "";
        }
      }
      function Qa(a) {
        if (null == a) return null;
        if ("function" === typeof a) return a.displayName || a.name || null;
        if ("string" === typeof a) return a;
        switch (a) {
          case ya:
            return "Fragment";
          case wa:
            return "Portal";
          case Aa:
            return "Profiler";
          case za:
            return "StrictMode";
          case Ea:
            return "Suspense";
          case Fa:
            return "SuspenseList";
        }
        if ("object" === typeof a) switch (a.$$typeof) {
          case Ca:
            return (a.displayName || "Context") + ".Consumer";
          case Ba:
            return (a._context.displayName || "Context") + ".Provider";
          case Da:
            var b = a.render;
            a = a.displayName;
            a || (a = b.displayName || b.name || "", a = "" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
            return a;
          case Ga:
            return b = a.displayName || null, null !== b ? b : Qa(a.type) || "Memo";
          case Ha:
            b = a._payload;
            a = a._init;
            try {
              return Qa(a(b));
            } catch (c) {
            }
        }
        return null;
      }
      function Ra(a) {
        var b = a.type;
        switch (a.tag) {
          case 24:
            return "Cache";
          case 9:
            return (b.displayName || "Context") + ".Consumer";
          case 10:
            return (b._context.displayName || "Context") + ".Provider";
          case 18:
            return "DehydratedFragment";
          case 11:
            return a = b.render, a = a.displayName || a.name || "", b.displayName || ("" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
          case 7:
            return "Fragment";
          case 5:
            return b;
          case 4:
            return "Portal";
          case 3:
            return "Root";
          case 6:
            return "Text";
          case 16:
            return Qa(b);
          case 8:
            return b === za ? "StrictMode" : "Mode";
          case 22:
            return "Offscreen";
          case 12:
            return "Profiler";
          case 21:
            return "Scope";
          case 13:
            return "Suspense";
          case 19:
            return "SuspenseList";
          case 25:
            return "TracingMarker";
          case 1:
          case 0:
          case 17:
          case 2:
          case 14:
          case 15:
            if ("function" === typeof b) return b.displayName || b.name || null;
            if ("string" === typeof b) return b;
        }
        return null;
      }
      function Sa(a) {
        switch (typeof a) {
          case "boolean":
          case "number":
          case "string":
          case "undefined":
            return a;
          case "object":
            return a;
          default:
            return "";
        }
      }
      function Ta(a) {
        var b = a.type;
        return (a = a.nodeName) && "input" === a.toLowerCase() && ("checkbox" === b || "radio" === b);
      }
      function Ua(a) {
        var b = Ta(a) ? "checked" : "value", c = Object.getOwnPropertyDescriptor(a.constructor.prototype, b), d = "" + a[b];
        if (!a.hasOwnProperty(b) && "undefined" !== typeof c && "function" === typeof c.get && "function" === typeof c.set) {
          var e = c.get, f = c.set;
          Object.defineProperty(a, b, { configurable: true, get: function() {
            return e.call(this);
          }, set: function(a2) {
            d = "" + a2;
            f.call(this, a2);
          } });
          Object.defineProperty(a, b, { enumerable: c.enumerable });
          return { getValue: function() {
            return d;
          }, setValue: function(a2) {
            d = "" + a2;
          }, stopTracking: function() {
            a._valueTracker = null;
            delete a[b];
          } };
        }
      }
      function Va(a) {
        a._valueTracker || (a._valueTracker = Ua(a));
      }
      function Wa(a) {
        if (!a) return false;
        var b = a._valueTracker;
        if (!b) return true;
        var c = b.getValue();
        var d = "";
        a && (d = Ta(a) ? a.checked ? "true" : "false" : a.value);
        a = d;
        return a !== c ? (b.setValue(a), true) : false;
      }
      function Xa(a) {
        a = a || ("undefined" !== typeof document ? document : void 0);
        if ("undefined" === typeof a) return null;
        try {
          return a.activeElement || a.body;
        } catch (b) {
          return a.body;
        }
      }
      function Ya(a, b) {
        var c = b.checked;
        return A({}, b, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: null != c ? c : a._wrapperState.initialChecked });
      }
      function Za(a, b) {
        var c = null == b.defaultValue ? "" : b.defaultValue, d = null != b.checked ? b.checked : b.defaultChecked;
        c = Sa(null != b.value ? b.value : c);
        a._wrapperState = { initialChecked: d, initialValue: c, controlled: "checkbox" === b.type || "radio" === b.type ? null != b.checked : null != b.value };
      }
      function ab(a, b) {
        b = b.checked;
        null != b && ta(a, "checked", b, false);
      }
      function bb(a, b) {
        ab(a, b);
        var c = Sa(b.value), d = b.type;
        if (null != c) if ("number" === d) {
          if (0 === c && "" === a.value || a.value != c) a.value = "" + c;
        } else a.value !== "" + c && (a.value = "" + c);
        else if ("submit" === d || "reset" === d) {
          a.removeAttribute("value");
          return;
        }
        b.hasOwnProperty("value") ? cb(a, b.type, c) : b.hasOwnProperty("defaultValue") && cb(a, b.type, Sa(b.defaultValue));
        null == b.checked && null != b.defaultChecked && (a.defaultChecked = !!b.defaultChecked);
      }
      function db(a, b, c) {
        if (b.hasOwnProperty("value") || b.hasOwnProperty("defaultValue")) {
          var d = b.type;
          if (!("submit" !== d && "reset" !== d || void 0 !== b.value && null !== b.value)) return;
          b = "" + a._wrapperState.initialValue;
          c || b === a.value || (a.value = b);
          a.defaultValue = b;
        }
        c = a.name;
        "" !== c && (a.name = "");
        a.defaultChecked = !!a._wrapperState.initialChecked;
        "" !== c && (a.name = c);
      }
      function cb(a, b, c) {
        if ("number" !== b || Xa(a.ownerDocument) !== a) null == c ? a.defaultValue = "" + a._wrapperState.initialValue : a.defaultValue !== "" + c && (a.defaultValue = "" + c);
      }
      var eb = Array.isArray;
      function fb(a, b, c, d) {
        a = a.options;
        if (b) {
          b = {};
          for (var e = 0; e < c.length; e++) b["$" + c[e]] = true;
          for (c = 0; c < a.length; c++) e = b.hasOwnProperty("$" + a[c].value), a[c].selected !== e && (a[c].selected = e), e && d && (a[c].defaultSelected = true);
        } else {
          c = "" + Sa(c);
          b = null;
          for (e = 0; e < a.length; e++) {
            if (a[e].value === c) {
              a[e].selected = true;
              d && (a[e].defaultSelected = true);
              return;
            }
            null !== b || a[e].disabled || (b = a[e]);
          }
          null !== b && (b.selected = true);
        }
      }
      function gb(a, b) {
        if (null != b.dangerouslySetInnerHTML) throw Error(p(91));
        return A({}, b, { value: void 0, defaultValue: void 0, children: "" + a._wrapperState.initialValue });
      }
      function hb(a, b) {
        var c = b.value;
        if (null == c) {
          c = b.children;
          b = b.defaultValue;
          if (null != c) {
            if (null != b) throw Error(p(92));
            if (eb(c)) {
              if (1 < c.length) throw Error(p(93));
              c = c[0];
            }
            b = c;
          }
          null == b && (b = "");
          c = b;
        }
        a._wrapperState = { initialValue: Sa(c) };
      }
      function ib(a, b) {
        var c = Sa(b.value), d = Sa(b.defaultValue);
        null != c && (c = "" + c, c !== a.value && (a.value = c), null == b.defaultValue && a.defaultValue !== c && (a.defaultValue = c));
        null != d && (a.defaultValue = "" + d);
      }
      function jb(a) {
        var b = a.textContent;
        b === a._wrapperState.initialValue && "" !== b && null !== b && (a.value = b);
      }
      function kb(a) {
        switch (a) {
          case "svg":
            return "http://www.w3.org/2000/svg";
          case "math":
            return "http://www.w3.org/1998/Math/MathML";
          default:
            return "http://www.w3.org/1999/xhtml";
        }
      }
      function lb(a, b) {
        return null == a || "http://www.w3.org/1999/xhtml" === a ? kb(b) : "http://www.w3.org/2000/svg" === a && "foreignObject" === b ? "http://www.w3.org/1999/xhtml" : a;
      }
      var mb;
      var nb = (function(a) {
        return "undefined" !== typeof MSApp && MSApp.execUnsafeLocalFunction ? function(b, c, d, e) {
          MSApp.execUnsafeLocalFunction(function() {
            return a(b, c, d, e);
          });
        } : a;
      })(function(a, b) {
        if ("http://www.w3.org/2000/svg" !== a.namespaceURI || "innerHTML" in a) a.innerHTML = b;
        else {
          mb = mb || document.createElement("div");
          mb.innerHTML = "<svg>" + b.valueOf().toString() + "</svg>";
          for (b = mb.firstChild; a.firstChild; ) a.removeChild(a.firstChild);
          for (; b.firstChild; ) a.appendChild(b.firstChild);
        }
      });
      function ob(a, b) {
        if (b) {
          var c = a.firstChild;
          if (c && c === a.lastChild && 3 === c.nodeType) {
            c.nodeValue = b;
            return;
          }
        }
        a.textContent = b;
      }
      var pb = {
        animationIterationCount: true,
        aspectRatio: true,
        borderImageOutset: true,
        borderImageSlice: true,
        borderImageWidth: true,
        boxFlex: true,
        boxFlexGroup: true,
        boxOrdinalGroup: true,
        columnCount: true,
        columns: true,
        flex: true,
        flexGrow: true,
        flexPositive: true,
        flexShrink: true,
        flexNegative: true,
        flexOrder: true,
        gridArea: true,
        gridRow: true,
        gridRowEnd: true,
        gridRowSpan: true,
        gridRowStart: true,
        gridColumn: true,
        gridColumnEnd: true,
        gridColumnSpan: true,
        gridColumnStart: true,
        fontWeight: true,
        lineClamp: true,
        lineHeight: true,
        opacity: true,
        order: true,
        orphans: true,
        tabSize: true,
        widows: true,
        zIndex: true,
        zoom: true,
        fillOpacity: true,
        floodOpacity: true,
        stopOpacity: true,
        strokeDasharray: true,
        strokeDashoffset: true,
        strokeMiterlimit: true,
        strokeOpacity: true,
        strokeWidth: true
      };
      var qb = ["Webkit", "ms", "Moz", "O"];
      Object.keys(pb).forEach(function(a) {
        qb.forEach(function(b) {
          b = b + a.charAt(0).toUpperCase() + a.substring(1);
          pb[b] = pb[a];
        });
      });
      function rb(a, b, c) {
        return null == b || "boolean" === typeof b || "" === b ? "" : c || "number" !== typeof b || 0 === b || pb.hasOwnProperty(a) && pb[a] ? ("" + b).trim() : b + "px";
      }
      function sb(a, b) {
        a = a.style;
        for (var c in b) if (b.hasOwnProperty(c)) {
          var d = 0 === c.indexOf("--"), e = rb(c, b[c], d);
          "float" === c && (c = "cssFloat");
          d ? a.setProperty(c, e) : a[c] = e;
        }
      }
      var tb = A({ menuitem: true }, { area: true, base: true, br: true, col: true, embed: true, hr: true, img: true, input: true, keygen: true, link: true, meta: true, param: true, source: true, track: true, wbr: true });
      function ub(a, b) {
        if (b) {
          if (tb[a] && (null != b.children || null != b.dangerouslySetInnerHTML)) throw Error(p(137, a));
          if (null != b.dangerouslySetInnerHTML) {
            if (null != b.children) throw Error(p(60));
            if ("object" !== typeof b.dangerouslySetInnerHTML || !("__html" in b.dangerouslySetInnerHTML)) throw Error(p(61));
          }
          if (null != b.style && "object" !== typeof b.style) throw Error(p(62));
        }
      }
      function vb(a, b) {
        if (-1 === a.indexOf("-")) return "string" === typeof b.is;
        switch (a) {
          case "annotation-xml":
          case "color-profile":
          case "font-face":
          case "font-face-src":
          case "font-face-uri":
          case "font-face-format":
          case "font-face-name":
          case "missing-glyph":
            return false;
          default:
            return true;
        }
      }
      var wb = null;
      function xb(a) {
        a = a.target || a.srcElement || window;
        a.correspondingUseElement && (a = a.correspondingUseElement);
        return 3 === a.nodeType ? a.parentNode : a;
      }
      var yb = null;
      var zb = null;
      var Ab = null;
      function Bb(a) {
        if (a = Cb(a)) {
          if ("function" !== typeof yb) throw Error(p(280));
          var b = a.stateNode;
          b && (b = Db(b), yb(a.stateNode, a.type, b));
        }
      }
      function Eb(a) {
        zb ? Ab ? Ab.push(a) : Ab = [a] : zb = a;
      }
      function Fb() {
        if (zb) {
          var a = zb, b = Ab;
          Ab = zb = null;
          Bb(a);
          if (b) for (a = 0; a < b.length; a++) Bb(b[a]);
        }
      }
      function Gb(a, b) {
        return a(b);
      }
      function Hb() {
      }
      var Ib = false;
      function Jb(a, b, c) {
        if (Ib) return a(b, c);
        Ib = true;
        try {
          return Gb(a, b, c);
        } finally {
          if (Ib = false, null !== zb || null !== Ab) Hb(), Fb();
        }
      }
      function Kb(a, b) {
        var c = a.stateNode;
        if (null === c) return null;
        var d = Db(c);
        if (null === d) return null;
        c = d[b];
        a: switch (b) {
          case "onClick":
          case "onClickCapture":
          case "onDoubleClick":
          case "onDoubleClickCapture":
          case "onMouseDown":
          case "onMouseDownCapture":
          case "onMouseMove":
          case "onMouseMoveCapture":
          case "onMouseUp":
          case "onMouseUpCapture":
          case "onMouseEnter":
            (d = !d.disabled) || (a = a.type, d = !("button" === a || "input" === a || "select" === a || "textarea" === a));
            a = !d;
            break a;
          default:
            a = false;
        }
        if (a) return null;
        if (c && "function" !== typeof c) throw Error(p(231, b, typeof c));
        return c;
      }
      var Lb = false;
      if (ia) try {
        Mb = {};
        Object.defineProperty(Mb, "passive", { get: function() {
          Lb = true;
        } });
        window.addEventListener("test", Mb, Mb);
        window.removeEventListener("test", Mb, Mb);
      } catch (a) {
        Lb = false;
      }
      var Mb;
      function Nb(a, b, c, d, e, f, g, h, k) {
        var l = Array.prototype.slice.call(arguments, 3);
        try {
          b.apply(c, l);
        } catch (m) {
          this.onError(m);
        }
      }
      var Ob = false;
      var Pb = null;
      var Qb = false;
      var Rb = null;
      var Sb = { onError: function(a) {
        Ob = true;
        Pb = a;
      } };
      function Tb(a, b, c, d, e, f, g, h, k) {
        Ob = false;
        Pb = null;
        Nb.apply(Sb, arguments);
      }
      function Ub(a, b, c, d, e, f, g, h, k) {
        Tb.apply(this, arguments);
        if (Ob) {
          if (Ob) {
            var l = Pb;
            Ob = false;
            Pb = null;
          } else throw Error(p(198));
          Qb || (Qb = true, Rb = l);
        }
      }
      function Vb(a) {
        var b = a, c = a;
        if (a.alternate) for (; b.return; ) b = b.return;
        else {
          a = b;
          do
            b = a, 0 !== (b.flags & 4098) && (c = b.return), a = b.return;
          while (a);
        }
        return 3 === b.tag ? c : null;
      }
      function Wb(a) {
        if (13 === a.tag) {
          var b = a.memoizedState;
          null === b && (a = a.alternate, null !== a && (b = a.memoizedState));
          if (null !== b) return b.dehydrated;
        }
        return null;
      }
      function Xb(a) {
        if (Vb(a) !== a) throw Error(p(188));
      }
      function Yb(a) {
        var b = a.alternate;
        if (!b) {
          b = Vb(a);
          if (null === b) throw Error(p(188));
          return b !== a ? null : a;
        }
        for (var c = a, d = b; ; ) {
          var e = c.return;
          if (null === e) break;
          var f = e.alternate;
          if (null === f) {
            d = e.return;
            if (null !== d) {
              c = d;
              continue;
            }
            break;
          }
          if (e.child === f.child) {
            for (f = e.child; f; ) {
              if (f === c) return Xb(e), a;
              if (f === d) return Xb(e), b;
              f = f.sibling;
            }
            throw Error(p(188));
          }
          if (c.return !== d.return) c = e, d = f;
          else {
            for (var g = false, h = e.child; h; ) {
              if (h === c) {
                g = true;
                c = e;
                d = f;
                break;
              }
              if (h === d) {
                g = true;
                d = e;
                c = f;
                break;
              }
              h = h.sibling;
            }
            if (!g) {
              for (h = f.child; h; ) {
                if (h === c) {
                  g = true;
                  c = f;
                  d = e;
                  break;
                }
                if (h === d) {
                  g = true;
                  d = f;
                  c = e;
                  break;
                }
                h = h.sibling;
              }
              if (!g) throw Error(p(189));
            }
          }
          if (c.alternate !== d) throw Error(p(190));
        }
        if (3 !== c.tag) throw Error(p(188));
        return c.stateNode.current === c ? a : b;
      }
      function Zb(a) {
        a = Yb(a);
        return null !== a ? $b(a) : null;
      }
      function $b(a) {
        if (5 === a.tag || 6 === a.tag) return a;
        for (a = a.child; null !== a; ) {
          var b = $b(a);
          if (null !== b) return b;
          a = a.sibling;
        }
        return null;
      }
      var ac = ca.unstable_scheduleCallback;
      var bc = ca.unstable_cancelCallback;
      var cc = ca.unstable_shouldYield;
      var dc = ca.unstable_requestPaint;
      var B = ca.unstable_now;
      var ec = ca.unstable_getCurrentPriorityLevel;
      var fc = ca.unstable_ImmediatePriority;
      var gc = ca.unstable_UserBlockingPriority;
      var hc = ca.unstable_NormalPriority;
      var ic = ca.unstable_LowPriority;
      var jc = ca.unstable_IdlePriority;
      var kc = null;
      var lc = null;
      function mc(a) {
        if (lc && "function" === typeof lc.onCommitFiberRoot) try {
          lc.onCommitFiberRoot(kc, a, void 0, 128 === (a.current.flags & 128));
        } catch (b) {
        }
      }
      var oc = Math.clz32 ? Math.clz32 : nc;
      var pc = Math.log;
      var qc = Math.LN2;
      function nc(a) {
        a >>>= 0;
        return 0 === a ? 32 : 31 - (pc(a) / qc | 0) | 0;
      }
      var rc = 64;
      var sc = 4194304;
      function tc(a) {
        switch (a & -a) {
          case 1:
            return 1;
          case 2:
            return 2;
          case 4:
            return 4;
          case 8:
            return 8;
          case 16:
            return 16;
          case 32:
            return 32;
          case 64:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return a & 4194240;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
          case 67108864:
            return a & 130023424;
          case 134217728:
            return 134217728;
          case 268435456:
            return 268435456;
          case 536870912:
            return 536870912;
          case 1073741824:
            return 1073741824;
          default:
            return a;
        }
      }
      function uc(a, b) {
        var c = a.pendingLanes;
        if (0 === c) return 0;
        var d = 0, e = a.suspendedLanes, f = a.pingedLanes, g = c & 268435455;
        if (0 !== g) {
          var h = g & ~e;
          0 !== h ? d = tc(h) : (f &= g, 0 !== f && (d = tc(f)));
        } else g = c & ~e, 0 !== g ? d = tc(g) : 0 !== f && (d = tc(f));
        if (0 === d) return 0;
        if (0 !== b && b !== d && 0 === (b & e) && (e = d & -d, f = b & -b, e >= f || 16 === e && 0 !== (f & 4194240))) return b;
        0 !== (d & 4) && (d |= c & 16);
        b = a.entangledLanes;
        if (0 !== b) for (a = a.entanglements, b &= d; 0 < b; ) c = 31 - oc(b), e = 1 << c, d |= a[c], b &= ~e;
        return d;
      }
      function vc(a, b) {
        switch (a) {
          case 1:
          case 2:
          case 4:
            return b + 250;
          case 8:
          case 16:
          case 32:
          case 64:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return b + 5e3;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
          case 67108864:
            return -1;
          case 134217728:
          case 268435456:
          case 536870912:
          case 1073741824:
            return -1;
          default:
            return -1;
        }
      }
      function wc(a, b) {
        for (var c = a.suspendedLanes, d = a.pingedLanes, e = a.expirationTimes, f = a.pendingLanes; 0 < f; ) {
          var g = 31 - oc(f), h = 1 << g, k = e[g];
          if (-1 === k) {
            if (0 === (h & c) || 0 !== (h & d)) e[g] = vc(h, b);
          } else k <= b && (a.expiredLanes |= h);
          f &= ~h;
        }
      }
      function xc(a) {
        a = a.pendingLanes & -1073741825;
        return 0 !== a ? a : a & 1073741824 ? 1073741824 : 0;
      }
      function yc() {
        var a = rc;
        rc <<= 1;
        0 === (rc & 4194240) && (rc = 64);
        return a;
      }
      function zc(a) {
        for (var b = [], c = 0; 31 > c; c++) b.push(a);
        return b;
      }
      function Ac(a, b, c) {
        a.pendingLanes |= b;
        536870912 !== b && (a.suspendedLanes = 0, a.pingedLanes = 0);
        a = a.eventTimes;
        b = 31 - oc(b);
        a[b] = c;
      }
      function Bc(a, b) {
        var c = a.pendingLanes & ~b;
        a.pendingLanes = b;
        a.suspendedLanes = 0;
        a.pingedLanes = 0;
        a.expiredLanes &= b;
        a.mutableReadLanes &= b;
        a.entangledLanes &= b;
        b = a.entanglements;
        var d = a.eventTimes;
        for (a = a.expirationTimes; 0 < c; ) {
          var e = 31 - oc(c), f = 1 << e;
          b[e] = 0;
          d[e] = -1;
          a[e] = -1;
          c &= ~f;
        }
      }
      function Cc(a, b) {
        var c = a.entangledLanes |= b;
        for (a = a.entanglements; c; ) {
          var d = 31 - oc(c), e = 1 << d;
          e & b | a[d] & b && (a[d] |= b);
          c &= ~e;
        }
      }
      var C = 0;
      function Dc(a) {
        a &= -a;
        return 1 < a ? 4 < a ? 0 !== (a & 268435455) ? 16 : 536870912 : 4 : 1;
      }
      var Ec;
      var Fc;
      var Gc;
      var Hc;
      var Ic;
      var Jc = false;
      var Kc = [];
      var Lc = null;
      var Mc = null;
      var Nc = null;
      var Oc = /* @__PURE__ */ new Map();
      var Pc = /* @__PURE__ */ new Map();
      var Qc = [];
      var Rc = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
      function Sc(a, b) {
        switch (a) {
          case "focusin":
          case "focusout":
            Lc = null;
            break;
          case "dragenter":
          case "dragleave":
            Mc = null;
            break;
          case "mouseover":
          case "mouseout":
            Nc = null;
            break;
          case "pointerover":
          case "pointerout":
            Oc.delete(b.pointerId);
            break;
          case "gotpointercapture":
          case "lostpointercapture":
            Pc.delete(b.pointerId);
        }
      }
      function Tc(a, b, c, d, e, f) {
        if (null === a || a.nativeEvent !== f) return a = { blockedOn: b, domEventName: c, eventSystemFlags: d, nativeEvent: f, targetContainers: [e] }, null !== b && (b = Cb(b), null !== b && Fc(b)), a;
        a.eventSystemFlags |= d;
        b = a.targetContainers;
        null !== e && -1 === b.indexOf(e) && b.push(e);
        return a;
      }
      function Uc(a, b, c, d, e) {
        switch (b) {
          case "focusin":
            return Lc = Tc(Lc, a, b, c, d, e), true;
          case "dragenter":
            return Mc = Tc(Mc, a, b, c, d, e), true;
          case "mouseover":
            return Nc = Tc(Nc, a, b, c, d, e), true;
          case "pointerover":
            var f = e.pointerId;
            Oc.set(f, Tc(Oc.get(f) || null, a, b, c, d, e));
            return true;
          case "gotpointercapture":
            return f = e.pointerId, Pc.set(f, Tc(Pc.get(f) || null, a, b, c, d, e)), true;
        }
        return false;
      }
      function Vc(a) {
        var b = Wc(a.target);
        if (null !== b) {
          var c = Vb(b);
          if (null !== c) {
            if (b = c.tag, 13 === b) {
              if (b = Wb(c), null !== b) {
                a.blockedOn = b;
                Ic(a.priority, function() {
                  Gc(c);
                });
                return;
              }
            } else if (3 === b && c.stateNode.current.memoizedState.isDehydrated) {
              a.blockedOn = 3 === c.tag ? c.stateNode.containerInfo : null;
              return;
            }
          }
        }
        a.blockedOn = null;
      }
      function Xc(a) {
        if (null !== a.blockedOn) return false;
        for (var b = a.targetContainers; 0 < b.length; ) {
          var c = Yc(a.domEventName, a.eventSystemFlags, b[0], a.nativeEvent);
          if (null === c) {
            c = a.nativeEvent;
            var d = new c.constructor(c.type, c);
            wb = d;
            c.target.dispatchEvent(d);
            wb = null;
          } else return b = Cb(c), null !== b && Fc(b), a.blockedOn = c, false;
          b.shift();
        }
        return true;
      }
      function Zc(a, b, c) {
        Xc(a) && c.delete(b);
      }
      function $c() {
        Jc = false;
        null !== Lc && Xc(Lc) && (Lc = null);
        null !== Mc && Xc(Mc) && (Mc = null);
        null !== Nc && Xc(Nc) && (Nc = null);
        Oc.forEach(Zc);
        Pc.forEach(Zc);
      }
      function ad(a, b) {
        a.blockedOn === b && (a.blockedOn = null, Jc || (Jc = true, ca.unstable_scheduleCallback(ca.unstable_NormalPriority, $c)));
      }
      function bd(a) {
        function b(b2) {
          return ad(b2, a);
        }
        if (0 < Kc.length) {
          ad(Kc[0], a);
          for (var c = 1; c < Kc.length; c++) {
            var d = Kc[c];
            d.blockedOn === a && (d.blockedOn = null);
          }
        }
        null !== Lc && ad(Lc, a);
        null !== Mc && ad(Mc, a);
        null !== Nc && ad(Nc, a);
        Oc.forEach(b);
        Pc.forEach(b);
        for (c = 0; c < Qc.length; c++) d = Qc[c], d.blockedOn === a && (d.blockedOn = null);
        for (; 0 < Qc.length && (c = Qc[0], null === c.blockedOn); ) Vc(c), null === c.blockedOn && Qc.shift();
      }
      var cd = ua.ReactCurrentBatchConfig;
      var dd = true;
      function ed(a, b, c, d) {
        var e = C, f = cd.transition;
        cd.transition = null;
        try {
          C = 1, fd(a, b, c, d);
        } finally {
          C = e, cd.transition = f;
        }
      }
      function gd(a, b, c, d) {
        var e = C, f = cd.transition;
        cd.transition = null;
        try {
          C = 4, fd(a, b, c, d);
        } finally {
          C = e, cd.transition = f;
        }
      }
      function fd(a, b, c, d) {
        if (dd) {
          var e = Yc(a, b, c, d);
          if (null === e) hd(a, b, d, id, c), Sc(a, d);
          else if (Uc(e, a, b, c, d)) d.stopPropagation();
          else if (Sc(a, d), b & 4 && -1 < Rc.indexOf(a)) {
            for (; null !== e; ) {
              var f = Cb(e);
              null !== f && Ec(f);
              f = Yc(a, b, c, d);
              null === f && hd(a, b, d, id, c);
              if (f === e) break;
              e = f;
            }
            null !== e && d.stopPropagation();
          } else hd(a, b, d, null, c);
        }
      }
      var id = null;
      function Yc(a, b, c, d) {
        id = null;
        a = xb(d);
        a = Wc(a);
        if (null !== a) if (b = Vb(a), null === b) a = null;
        else if (c = b.tag, 13 === c) {
          a = Wb(b);
          if (null !== a) return a;
          a = null;
        } else if (3 === c) {
          if (b.stateNode.current.memoizedState.isDehydrated) return 3 === b.tag ? b.stateNode.containerInfo : null;
          a = null;
        } else b !== a && (a = null);
        id = a;
        return null;
      }
      function jd(a) {
        switch (a) {
          case "cancel":
          case "click":
          case "close":
          case "contextmenu":
          case "copy":
          case "cut":
          case "auxclick":
          case "dblclick":
          case "dragend":
          case "dragstart":
          case "drop":
          case "focusin":
          case "focusout":
          case "input":
          case "invalid":
          case "keydown":
          case "keypress":
          case "keyup":
          case "mousedown":
          case "mouseup":
          case "paste":
          case "pause":
          case "play":
          case "pointercancel":
          case "pointerdown":
          case "pointerup":
          case "ratechange":
          case "reset":
          case "resize":
          case "seeked":
          case "submit":
          case "touchcancel":
          case "touchend":
          case "touchstart":
          case "volumechange":
          case "change":
          case "selectionchange":
          case "textInput":
          case "compositionstart":
          case "compositionend":
          case "compositionupdate":
          case "beforeblur":
          case "afterblur":
          case "beforeinput":
          case "blur":
          case "fullscreenchange":
          case "focus":
          case "hashchange":
          case "popstate":
          case "select":
          case "selectstart":
            return 1;
          case "drag":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "mousemove":
          case "mouseout":
          case "mouseover":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "scroll":
          case "toggle":
          case "touchmove":
          case "wheel":
          case "mouseenter":
          case "mouseleave":
          case "pointerenter":
          case "pointerleave":
            return 4;
          case "message":
            switch (ec()) {
              case fc:
                return 1;
              case gc:
                return 4;
              case hc:
              case ic:
                return 16;
              case jc:
                return 536870912;
              default:
                return 16;
            }
          default:
            return 16;
        }
      }
      var kd = null;
      var ld = null;
      var md = null;
      function nd() {
        if (md) return md;
        var a, b = ld, c = b.length, d, e = "value" in kd ? kd.value : kd.textContent, f = e.length;
        for (a = 0; a < c && b[a] === e[a]; a++) ;
        var g = c - a;
        for (d = 1; d <= g && b[c - d] === e[f - d]; d++) ;
        return md = e.slice(a, 1 < d ? 1 - d : void 0);
      }
      function od(a) {
        var b = a.keyCode;
        "charCode" in a ? (a = a.charCode, 0 === a && 13 === b && (a = 13)) : a = b;
        10 === a && (a = 13);
        return 32 <= a || 13 === a ? a : 0;
      }
      function pd() {
        return true;
      }
      function qd() {
        return false;
      }
      function rd(a) {
        function b(b2, d, e, f, g) {
          this._reactName = b2;
          this._targetInst = e;
          this.type = d;
          this.nativeEvent = f;
          this.target = g;
          this.currentTarget = null;
          for (var c in a) a.hasOwnProperty(c) && (b2 = a[c], this[c] = b2 ? b2(f) : f[c]);
          this.isDefaultPrevented = (null != f.defaultPrevented ? f.defaultPrevented : false === f.returnValue) ? pd : qd;
          this.isPropagationStopped = qd;
          return this;
        }
        A(b.prototype, { preventDefault: function() {
          this.defaultPrevented = true;
          var a2 = this.nativeEvent;
          a2 && (a2.preventDefault ? a2.preventDefault() : "unknown" !== typeof a2.returnValue && (a2.returnValue = false), this.isDefaultPrevented = pd);
        }, stopPropagation: function() {
          var a2 = this.nativeEvent;
          a2 && (a2.stopPropagation ? a2.stopPropagation() : "unknown" !== typeof a2.cancelBubble && (a2.cancelBubble = true), this.isPropagationStopped = pd);
        }, persist: function() {
        }, isPersistent: pd });
        return b;
      }
      var sd = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(a) {
        return a.timeStamp || Date.now();
      }, defaultPrevented: 0, isTrusted: 0 };
      var td = rd(sd);
      var ud = A({}, sd, { view: 0, detail: 0 });
      var vd = rd(ud);
      var wd;
      var xd;
      var yd;
      var Ad = A({}, ud, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: zd, button: 0, buttons: 0, relatedTarget: function(a) {
        return void 0 === a.relatedTarget ? a.fromElement === a.srcElement ? a.toElement : a.fromElement : a.relatedTarget;
      }, movementX: function(a) {
        if ("movementX" in a) return a.movementX;
        a !== yd && (yd && "mousemove" === a.type ? (wd = a.screenX - yd.screenX, xd = a.screenY - yd.screenY) : xd = wd = 0, yd = a);
        return wd;
      }, movementY: function(a) {
        return "movementY" in a ? a.movementY : xd;
      } });
      var Bd = rd(Ad);
      var Cd = A({}, Ad, { dataTransfer: 0 });
      var Dd = rd(Cd);
      var Ed = A({}, ud, { relatedTarget: 0 });
      var Fd = rd(Ed);
      var Gd = A({}, sd, { animationName: 0, elapsedTime: 0, pseudoElement: 0 });
      var Hd = rd(Gd);
      var Id = A({}, sd, { clipboardData: function(a) {
        return "clipboardData" in a ? a.clipboardData : window.clipboardData;
      } });
      var Jd = rd(Id);
      var Kd = A({}, sd, { data: 0 });
      var Ld = rd(Kd);
      var Md = {
        Esc: "Escape",
        Spacebar: " ",
        Left: "ArrowLeft",
        Up: "ArrowUp",
        Right: "ArrowRight",
        Down: "ArrowDown",
        Del: "Delete",
        Win: "OS",
        Menu: "ContextMenu",
        Apps: "ContextMenu",
        Scroll: "ScrollLock",
        MozPrintableKey: "Unidentified"
      };
      var Nd = {
        8: "Backspace",
        9: "Tab",
        12: "Clear",
        13: "Enter",
        16: "Shift",
        17: "Control",
        18: "Alt",
        19: "Pause",
        20: "CapsLock",
        27: "Escape",
        32: " ",
        33: "PageUp",
        34: "PageDown",
        35: "End",
        36: "Home",
        37: "ArrowLeft",
        38: "ArrowUp",
        39: "ArrowRight",
        40: "ArrowDown",
        45: "Insert",
        46: "Delete",
        112: "F1",
        113: "F2",
        114: "F3",
        115: "F4",
        116: "F5",
        117: "F6",
        118: "F7",
        119: "F8",
        120: "F9",
        121: "F10",
        122: "F11",
        123: "F12",
        144: "NumLock",
        145: "ScrollLock",
        224: "Meta"
      };
      var Od = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
      function Pd(a) {
        var b = this.nativeEvent;
        return b.getModifierState ? b.getModifierState(a) : (a = Od[a]) ? !!b[a] : false;
      }
      function zd() {
        return Pd;
      }
      var Qd = A({}, ud, { key: function(a) {
        if (a.key) {
          var b = Md[a.key] || a.key;
          if ("Unidentified" !== b) return b;
        }
        return "keypress" === a.type ? (a = od(a), 13 === a ? "Enter" : String.fromCharCode(a)) : "keydown" === a.type || "keyup" === a.type ? Nd[a.keyCode] || "Unidentified" : "";
      }, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: zd, charCode: function(a) {
        return "keypress" === a.type ? od(a) : 0;
      }, keyCode: function(a) {
        return "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
      }, which: function(a) {
        return "keypress" === a.type ? od(a) : "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
      } });
      var Rd = rd(Qd);
      var Sd = A({}, Ad, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 });
      var Td = rd(Sd);
      var Ud = A({}, ud, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: zd });
      var Vd = rd(Ud);
      var Wd = A({}, sd, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 });
      var Xd = rd(Wd);
      var Yd = A({}, Ad, {
        deltaX: function(a) {
          return "deltaX" in a ? a.deltaX : "wheelDeltaX" in a ? -a.wheelDeltaX : 0;
        },
        deltaY: function(a) {
          return "deltaY" in a ? a.deltaY : "wheelDeltaY" in a ? -a.wheelDeltaY : "wheelDelta" in a ? -a.wheelDelta : 0;
        },
        deltaZ: 0,
        deltaMode: 0
      });
      var Zd = rd(Yd);
      var $d = [9, 13, 27, 32];
      var ae = ia && "CompositionEvent" in window;
      var be = null;
      ia && "documentMode" in document && (be = document.documentMode);
      var ce = ia && "TextEvent" in window && !be;
      var de = ia && (!ae || be && 8 < be && 11 >= be);
      var ee = String.fromCharCode(32);
      var fe = false;
      function ge(a, b) {
        switch (a) {
          case "keyup":
            return -1 !== $d.indexOf(b.keyCode);
          case "keydown":
            return 229 !== b.keyCode;
          case "keypress":
          case "mousedown":
          case "focusout":
            return true;
          default:
            return false;
        }
      }
      function he(a) {
        a = a.detail;
        return "object" === typeof a && "data" in a ? a.data : null;
      }
      var ie = false;
      function je(a, b) {
        switch (a) {
          case "compositionend":
            return he(b);
          case "keypress":
            if (32 !== b.which) return null;
            fe = true;
            return ee;
          case "textInput":
            return a = b.data, a === ee && fe ? null : a;
          default:
            return null;
        }
      }
      function ke(a, b) {
        if (ie) return "compositionend" === a || !ae && ge(a, b) ? (a = nd(), md = ld = kd = null, ie = false, a) : null;
        switch (a) {
          case "paste":
            return null;
          case "keypress":
            if (!(b.ctrlKey || b.altKey || b.metaKey) || b.ctrlKey && b.altKey) {
              if (b.char && 1 < b.char.length) return b.char;
              if (b.which) return String.fromCharCode(b.which);
            }
            return null;
          case "compositionend":
            return de && "ko" !== b.locale ? null : b.data;
          default:
            return null;
        }
      }
      var le = { color: true, date: true, datetime: true, "datetime-local": true, email: true, month: true, number: true, password: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true };
      function me(a) {
        var b = a && a.nodeName && a.nodeName.toLowerCase();
        return "input" === b ? !!le[a.type] : "textarea" === b ? true : false;
      }
      function ne(a, b, c, d) {
        Eb(d);
        b = oe(b, "onChange");
        0 < b.length && (c = new td("onChange", "change", null, c, d), a.push({ event: c, listeners: b }));
      }
      var pe = null;
      var qe = null;
      function re(a) {
        se(a, 0);
      }
      function te(a) {
        var b = ue(a);
        if (Wa(b)) return a;
      }
      function ve(a, b) {
        if ("change" === a) return b;
      }
      var we = false;
      if (ia) {
        if (ia) {
          ye = "oninput" in document;
          if (!ye) {
            ze = document.createElement("div");
            ze.setAttribute("oninput", "return;");
            ye = "function" === typeof ze.oninput;
          }
          xe = ye;
        } else xe = false;
        we = xe && (!document.documentMode || 9 < document.documentMode);
      }
      var xe;
      var ye;
      var ze;
      function Ae() {
        pe && (pe.detachEvent("onpropertychange", Be), qe = pe = null);
      }
      function Be(a) {
        if ("value" === a.propertyName && te(qe)) {
          var b = [];
          ne(b, qe, a, xb(a));
          Jb(re, b);
        }
      }
      function Ce(a, b, c) {
        "focusin" === a ? (Ae(), pe = b, qe = c, pe.attachEvent("onpropertychange", Be)) : "focusout" === a && Ae();
      }
      function De(a) {
        if ("selectionchange" === a || "keyup" === a || "keydown" === a) return te(qe);
      }
      function Ee(a, b) {
        if ("click" === a) return te(b);
      }
      function Fe(a, b) {
        if ("input" === a || "change" === a) return te(b);
      }
      function Ge(a, b) {
        return a === b && (0 !== a || 1 / a === 1 / b) || a !== a && b !== b;
      }
      var He = "function" === typeof Object.is ? Object.is : Ge;
      function Ie(a, b) {
        if (He(a, b)) return true;
        if ("object" !== typeof a || null === a || "object" !== typeof b || null === b) return false;
        var c = Object.keys(a), d = Object.keys(b);
        if (c.length !== d.length) return false;
        for (d = 0; d < c.length; d++) {
          var e = c[d];
          if (!ja.call(b, e) || !He(a[e], b[e])) return false;
        }
        return true;
      }
      function Je(a) {
        for (; a && a.firstChild; ) a = a.firstChild;
        return a;
      }
      function Ke(a, b) {
        var c = Je(a);
        a = 0;
        for (var d; c; ) {
          if (3 === c.nodeType) {
            d = a + c.textContent.length;
            if (a <= b && d >= b) return { node: c, offset: b - a };
            a = d;
          }
          a: {
            for (; c; ) {
              if (c.nextSibling) {
                c = c.nextSibling;
                break a;
              }
              c = c.parentNode;
            }
            c = void 0;
          }
          c = Je(c);
        }
      }
      function Le(a, b) {
        return a && b ? a === b ? true : a && 3 === a.nodeType ? false : b && 3 === b.nodeType ? Le(a, b.parentNode) : "contains" in a ? a.contains(b) : a.compareDocumentPosition ? !!(a.compareDocumentPosition(b) & 16) : false : false;
      }
      function Me() {
        for (var a = window, b = Xa(); b instanceof a.HTMLIFrameElement; ) {
          try {
            var c = "string" === typeof b.contentWindow.location.href;
          } catch (d) {
            c = false;
          }
          if (c) a = b.contentWindow;
          else break;
          b = Xa(a.document);
        }
        return b;
      }
      function Ne(a) {
        var b = a && a.nodeName && a.nodeName.toLowerCase();
        return b && ("input" === b && ("text" === a.type || "search" === a.type || "tel" === a.type || "url" === a.type || "password" === a.type) || "textarea" === b || "true" === a.contentEditable);
      }
      function Oe(a) {
        var b = Me(), c = a.focusedElem, d = a.selectionRange;
        if (b !== c && c && c.ownerDocument && Le(c.ownerDocument.documentElement, c)) {
          if (null !== d && Ne(c)) {
            if (b = d.start, a = d.end, void 0 === a && (a = b), "selectionStart" in c) c.selectionStart = b, c.selectionEnd = Math.min(a, c.value.length);
            else if (a = (b = c.ownerDocument || document) && b.defaultView || window, a.getSelection) {
              a = a.getSelection();
              var e = c.textContent.length, f = Math.min(d.start, e);
              d = void 0 === d.end ? f : Math.min(d.end, e);
              !a.extend && f > d && (e = d, d = f, f = e);
              e = Ke(c, f);
              var g = Ke(
                c,
                d
              );
              e && g && (1 !== a.rangeCount || a.anchorNode !== e.node || a.anchorOffset !== e.offset || a.focusNode !== g.node || a.focusOffset !== g.offset) && (b = b.createRange(), b.setStart(e.node, e.offset), a.removeAllRanges(), f > d ? (a.addRange(b), a.extend(g.node, g.offset)) : (b.setEnd(g.node, g.offset), a.addRange(b)));
            }
          }
          b = [];
          for (a = c; a = a.parentNode; ) 1 === a.nodeType && b.push({ element: a, left: a.scrollLeft, top: a.scrollTop });
          "function" === typeof c.focus && c.focus();
          for (c = 0; c < b.length; c++) a = b[c], a.element.scrollLeft = a.left, a.element.scrollTop = a.top;
        }
      }
      var Pe = ia && "documentMode" in document && 11 >= document.documentMode;
      var Qe = null;
      var Re = null;
      var Se = null;
      var Te = false;
      function Ue(a, b, c) {
        var d = c.window === c ? c.document : 9 === c.nodeType ? c : c.ownerDocument;
        Te || null == Qe || Qe !== Xa(d) || (d = Qe, "selectionStart" in d && Ne(d) ? d = { start: d.selectionStart, end: d.selectionEnd } : (d = (d.ownerDocument && d.ownerDocument.defaultView || window).getSelection(), d = { anchorNode: d.anchorNode, anchorOffset: d.anchorOffset, focusNode: d.focusNode, focusOffset: d.focusOffset }), Se && Ie(Se, d) || (Se = d, d = oe(Re, "onSelect"), 0 < d.length && (b = new td("onSelect", "select", null, b, c), a.push({ event: b, listeners: d }), b.target = Qe)));
      }
      function Ve(a, b) {
        var c = {};
        c[a.toLowerCase()] = b.toLowerCase();
        c["Webkit" + a] = "webkit" + b;
        c["Moz" + a] = "moz" + b;
        return c;
      }
      var We = { animationend: Ve("Animation", "AnimationEnd"), animationiteration: Ve("Animation", "AnimationIteration"), animationstart: Ve("Animation", "AnimationStart"), transitionend: Ve("Transition", "TransitionEnd") };
      var Xe = {};
      var Ye = {};
      ia && (Ye = document.createElement("div").style, "AnimationEvent" in window || (delete We.animationend.animation, delete We.animationiteration.animation, delete We.animationstart.animation), "TransitionEvent" in window || delete We.transitionend.transition);
      function Ze(a) {
        if (Xe[a]) return Xe[a];
        if (!We[a]) return a;
        var b = We[a], c;
        for (c in b) if (b.hasOwnProperty(c) && c in Ye) return Xe[a] = b[c];
        return a;
      }
      var $e = Ze("animationend");
      var af = Ze("animationiteration");
      var bf = Ze("animationstart");
      var cf = Ze("transitionend");
      var df = /* @__PURE__ */ new Map();
      var ef = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
      function ff(a, b) {
        df.set(a, b);
        fa(b, [a]);
      }
      for (gf = 0; gf < ef.length; gf++) {
        hf = ef[gf], jf = hf.toLowerCase(), kf = hf[0].toUpperCase() + hf.slice(1);
        ff(jf, "on" + kf);
      }
      var hf;
      var jf;
      var kf;
      var gf;
      ff($e, "onAnimationEnd");
      ff(af, "onAnimationIteration");
      ff(bf, "onAnimationStart");
      ff("dblclick", "onDoubleClick");
      ff("focusin", "onFocus");
      ff("focusout", "onBlur");
      ff(cf, "onTransitionEnd");
      ha("onMouseEnter", ["mouseout", "mouseover"]);
      ha("onMouseLeave", ["mouseout", "mouseover"]);
      ha("onPointerEnter", ["pointerout", "pointerover"]);
      ha("onPointerLeave", ["pointerout", "pointerover"]);
      fa("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
      fa("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
      fa("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
      fa("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
      fa("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
      fa("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
      var lf = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" ");
      var mf = new Set("cancel close invalid load scroll toggle".split(" ").concat(lf));
      function nf(a, b, c) {
        var d = a.type || "unknown-event";
        a.currentTarget = c;
        Ub(d, b, void 0, a);
        a.currentTarget = null;
      }
      function se(a, b) {
        b = 0 !== (b & 4);
        for (var c = 0; c < a.length; c++) {
          var d = a[c], e = d.event;
          d = d.listeners;
          a: {
            var f = void 0;
            if (b) for (var g = d.length - 1; 0 <= g; g--) {
              var h = d[g], k = h.instance, l = h.currentTarget;
              h = h.listener;
              if (k !== f && e.isPropagationStopped()) break a;
              nf(e, h, l);
              f = k;
            }
            else for (g = 0; g < d.length; g++) {
              h = d[g];
              k = h.instance;
              l = h.currentTarget;
              h = h.listener;
              if (k !== f && e.isPropagationStopped()) break a;
              nf(e, h, l);
              f = k;
            }
          }
        }
        if (Qb) throw a = Rb, Qb = false, Rb = null, a;
      }
      function D(a, b) {
        var c = b[of];
        void 0 === c && (c = b[of] = /* @__PURE__ */ new Set());
        var d = a + "__bubble";
        c.has(d) || (pf(b, a, 2, false), c.add(d));
      }
      function qf(a, b, c) {
        var d = 0;
        b && (d |= 4);
        pf(c, a, d, b);
      }
      var rf = "_reactListening" + Math.random().toString(36).slice(2);
      function sf(a) {
        if (!a[rf]) {
          a[rf] = true;
          da.forEach(function(b2) {
            "selectionchange" !== b2 && (mf.has(b2) || qf(b2, false, a), qf(b2, true, a));
          });
          var b = 9 === a.nodeType ? a : a.ownerDocument;
          null === b || b[rf] || (b[rf] = true, qf("selectionchange", false, b));
        }
      }
      function pf(a, b, c, d) {
        switch (jd(b)) {
          case 1:
            var e = ed;
            break;
          case 4:
            e = gd;
            break;
          default:
            e = fd;
        }
        c = e.bind(null, b, c, a);
        e = void 0;
        !Lb || "touchstart" !== b && "touchmove" !== b && "wheel" !== b || (e = true);
        d ? void 0 !== e ? a.addEventListener(b, c, { capture: true, passive: e }) : a.addEventListener(b, c, true) : void 0 !== e ? a.addEventListener(b, c, { passive: e }) : a.addEventListener(b, c, false);
      }
      function hd(a, b, c, d, e) {
        var f = d;
        if (0 === (b & 1) && 0 === (b & 2) && null !== d) a: for (; ; ) {
          if (null === d) return;
          var g = d.tag;
          if (3 === g || 4 === g) {
            var h = d.stateNode.containerInfo;
            if (h === e || 8 === h.nodeType && h.parentNode === e) break;
            if (4 === g) for (g = d.return; null !== g; ) {
              var k = g.tag;
              if (3 === k || 4 === k) {
                if (k = g.stateNode.containerInfo, k === e || 8 === k.nodeType && k.parentNode === e) return;
              }
              g = g.return;
            }
            for (; null !== h; ) {
              g = Wc(h);
              if (null === g) return;
              k = g.tag;
              if (5 === k || 6 === k) {
                d = f = g;
                continue a;
              }
              h = h.parentNode;
            }
          }
          d = d.return;
        }
        Jb(function() {
          var d2 = f, e2 = xb(c), g2 = [];
          a: {
            var h2 = df.get(a);
            if (void 0 !== h2) {
              var k2 = td, n = a;
              switch (a) {
                case "keypress":
                  if (0 === od(c)) break a;
                case "keydown":
                case "keyup":
                  k2 = Rd;
                  break;
                case "focusin":
                  n = "focus";
                  k2 = Fd;
                  break;
                case "focusout":
                  n = "blur";
                  k2 = Fd;
                  break;
                case "beforeblur":
                case "afterblur":
                  k2 = Fd;
                  break;
                case "click":
                  if (2 === c.button) break a;
                case "auxclick":
                case "dblclick":
                case "mousedown":
                case "mousemove":
                case "mouseup":
                case "mouseout":
                case "mouseover":
                case "contextmenu":
                  k2 = Bd;
                  break;
                case "drag":
                case "dragend":
                case "dragenter":
                case "dragexit":
                case "dragleave":
                case "dragover":
                case "dragstart":
                case "drop":
                  k2 = Dd;
                  break;
                case "touchcancel":
                case "touchend":
                case "touchmove":
                case "touchstart":
                  k2 = Vd;
                  break;
                case $e:
                case af:
                case bf:
                  k2 = Hd;
                  break;
                case cf:
                  k2 = Xd;
                  break;
                case "scroll":
                  k2 = vd;
                  break;
                case "wheel":
                  k2 = Zd;
                  break;
                case "copy":
                case "cut":
                case "paste":
                  k2 = Jd;
                  break;
                case "gotpointercapture":
                case "lostpointercapture":
                case "pointercancel":
                case "pointerdown":
                case "pointermove":
                case "pointerout":
                case "pointerover":
                case "pointerup":
                  k2 = Td;
              }
              var t = 0 !== (b & 4), J = !t && "scroll" === a, x = t ? null !== h2 ? h2 + "Capture" : null : h2;
              t = [];
              for (var w = d2, u; null !== w; ) {
                u = w;
                var F = u.stateNode;
                5 === u.tag && null !== F && (u = F, null !== x && (F = Kb(w, x), null != F && t.push(tf(w, F, u))));
                if (J) break;
                w = w.return;
              }
              0 < t.length && (h2 = new k2(h2, n, null, c, e2), g2.push({ event: h2, listeners: t }));
            }
          }
          if (0 === (b & 7)) {
            a: {
              h2 = "mouseover" === a || "pointerover" === a;
              k2 = "mouseout" === a || "pointerout" === a;
              if (h2 && c !== wb && (n = c.relatedTarget || c.fromElement) && (Wc(n) || n[uf])) break a;
              if (k2 || h2) {
                h2 = e2.window === e2 ? e2 : (h2 = e2.ownerDocument) ? h2.defaultView || h2.parentWindow : window;
                if (k2) {
                  if (n = c.relatedTarget || c.toElement, k2 = d2, n = n ? Wc(n) : null, null !== n && (J = Vb(n), n !== J || 5 !== n.tag && 6 !== n.tag)) n = null;
                } else k2 = null, n = d2;
                if (k2 !== n) {
                  t = Bd;
                  F = "onMouseLeave";
                  x = "onMouseEnter";
                  w = "mouse";
                  if ("pointerout" === a || "pointerover" === a) t = Td, F = "onPointerLeave", x = "onPointerEnter", w = "pointer";
                  J = null == k2 ? h2 : ue(k2);
                  u = null == n ? h2 : ue(n);
                  h2 = new t(F, w + "leave", k2, c, e2);
                  h2.target = J;
                  h2.relatedTarget = u;
                  F = null;
                  Wc(e2) === d2 && (t = new t(x, w + "enter", n, c, e2), t.target = u, t.relatedTarget = J, F = t);
                  J = F;
                  if (k2 && n) b: {
                    t = k2;
                    x = n;
                    w = 0;
                    for (u = t; u; u = vf(u)) w++;
                    u = 0;
                    for (F = x; F; F = vf(F)) u++;
                    for (; 0 < w - u; ) t = vf(t), w--;
                    for (; 0 < u - w; ) x = vf(x), u--;
                    for (; w--; ) {
                      if (t === x || null !== x && t === x.alternate) break b;
                      t = vf(t);
                      x = vf(x);
                    }
                    t = null;
                  }
                  else t = null;
                  null !== k2 && wf(g2, h2, k2, t, false);
                  null !== n && null !== J && wf(g2, J, n, t, true);
                }
              }
            }
            a: {
              h2 = d2 ? ue(d2) : window;
              k2 = h2.nodeName && h2.nodeName.toLowerCase();
              if ("select" === k2 || "input" === k2 && "file" === h2.type) var na = ve;
              else if (me(h2)) if (we) na = Fe;
              else {
                na = De;
                var xa = Ce;
              }
              else (k2 = h2.nodeName) && "input" === k2.toLowerCase() && ("checkbox" === h2.type || "radio" === h2.type) && (na = Ee);
              if (na && (na = na(a, d2))) {
                ne(g2, na, c, e2);
                break a;
              }
              xa && xa(a, h2, d2);
              "focusout" === a && (xa = h2._wrapperState) && xa.controlled && "number" === h2.type && cb(h2, "number", h2.value);
            }
            xa = d2 ? ue(d2) : window;
            switch (a) {
              case "focusin":
                if (me(xa) || "true" === xa.contentEditable) Qe = xa, Re = d2, Se = null;
                break;
              case "focusout":
                Se = Re = Qe = null;
                break;
              case "mousedown":
                Te = true;
                break;
              case "contextmenu":
              case "mouseup":
              case "dragend":
                Te = false;
                Ue(g2, c, e2);
                break;
              case "selectionchange":
                if (Pe) break;
              case "keydown":
              case "keyup":
                Ue(g2, c, e2);
            }
            var $a;
            if (ae) b: {
              switch (a) {
                case "compositionstart":
                  var ba = "onCompositionStart";
                  break b;
                case "compositionend":
                  ba = "onCompositionEnd";
                  break b;
                case "compositionupdate":
                  ba = "onCompositionUpdate";
                  break b;
              }
              ba = void 0;
            }
            else ie ? ge(a, c) && (ba = "onCompositionEnd") : "keydown" === a && 229 === c.keyCode && (ba = "onCompositionStart");
            ba && (de && "ko" !== c.locale && (ie || "onCompositionStart" !== ba ? "onCompositionEnd" === ba && ie && ($a = nd()) : (kd = e2, ld = "value" in kd ? kd.value : kd.textContent, ie = true)), xa = oe(d2, ba), 0 < xa.length && (ba = new Ld(ba, a, null, c, e2), g2.push({ event: ba, listeners: xa }), $a ? ba.data = $a : ($a = he(c), null !== $a && (ba.data = $a))));
            if ($a = ce ? je(a, c) : ke(a, c)) d2 = oe(d2, "onBeforeInput"), 0 < d2.length && (e2 = new Ld("onBeforeInput", "beforeinput", null, c, e2), g2.push({ event: e2, listeners: d2 }), e2.data = $a);
          }
          se(g2, b);
        });
      }
      function tf(a, b, c) {
        return { instance: a, listener: b, currentTarget: c };
      }
      function oe(a, b) {
        for (var c = b + "Capture", d = []; null !== a; ) {
          var e = a, f = e.stateNode;
          5 === e.tag && null !== f && (e = f, f = Kb(a, c), null != f && d.unshift(tf(a, f, e)), f = Kb(a, b), null != f && d.push(tf(a, f, e)));
          a = a.return;
        }
        return d;
      }
      function vf(a) {
        if (null === a) return null;
        do
          a = a.return;
        while (a && 5 !== a.tag);
        return a ? a : null;
      }
      function wf(a, b, c, d, e) {
        for (var f = b._reactName, g = []; null !== c && c !== d; ) {
          var h = c, k = h.alternate, l = h.stateNode;
          if (null !== k && k === d) break;
          5 === h.tag && null !== l && (h = l, e ? (k = Kb(c, f), null != k && g.unshift(tf(c, k, h))) : e || (k = Kb(c, f), null != k && g.push(tf(c, k, h))));
          c = c.return;
        }
        0 !== g.length && a.push({ event: b, listeners: g });
      }
      var xf = /\r\n?/g;
      var yf = /\u0000|\uFFFD/g;
      function zf(a) {
        return ("string" === typeof a ? a : "" + a).replace(xf, "\n").replace(yf, "");
      }
      function Af(a, b, c) {
        b = zf(b);
        if (zf(a) !== b && c) throw Error(p(425));
      }
      function Bf() {
      }
      var Cf = null;
      var Df = null;
      function Ef(a, b) {
        return "textarea" === a || "noscript" === a || "string" === typeof b.children || "number" === typeof b.children || "object" === typeof b.dangerouslySetInnerHTML && null !== b.dangerouslySetInnerHTML && null != b.dangerouslySetInnerHTML.__html;
      }
      var Ff = "function" === typeof setTimeout ? setTimeout : void 0;
      var Gf = "function" === typeof clearTimeout ? clearTimeout : void 0;
      var Hf = "function" === typeof Promise ? Promise : void 0;
      var Jf = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof Hf ? function(a) {
        return Hf.resolve(null).then(a).catch(If);
      } : Ff;
      function If(a) {
        setTimeout(function() {
          throw a;
        });
      }
      function Kf(a, b) {
        var c = b, d = 0;
        do {
          var e = c.nextSibling;
          a.removeChild(c);
          if (e && 8 === e.nodeType) if (c = e.data, "/$" === c) {
            if (0 === d) {
              a.removeChild(e);
              bd(b);
              return;
            }
            d--;
          } else "$" !== c && "$?" !== c && "$!" !== c || d++;
          c = e;
        } while (c);
        bd(b);
      }
      function Lf(a) {
        for (; null != a; a = a.nextSibling) {
          var b = a.nodeType;
          if (1 === b || 3 === b) break;
          if (8 === b) {
            b = a.data;
            if ("$" === b || "$!" === b || "$?" === b) break;
            if ("/$" === b) return null;
          }
        }
        return a;
      }
      function Mf(a) {
        a = a.previousSibling;
        for (var b = 0; a; ) {
          if (8 === a.nodeType) {
            var c = a.data;
            if ("$" === c || "$!" === c || "$?" === c) {
              if (0 === b) return a;
              b--;
            } else "/$" === c && b++;
          }
          a = a.previousSibling;
        }
        return null;
      }
      var Nf = Math.random().toString(36).slice(2);
      var Of = "__reactFiber$" + Nf;
      var Pf = "__reactProps$" + Nf;
      var uf = "__reactContainer$" + Nf;
      var of = "__reactEvents$" + Nf;
      var Qf = "__reactListeners$" + Nf;
      var Rf = "__reactHandles$" + Nf;
      function Wc(a) {
        var b = a[Of];
        if (b) return b;
        for (var c = a.parentNode; c; ) {
          if (b = c[uf] || c[Of]) {
            c = b.alternate;
            if (null !== b.child || null !== c && null !== c.child) for (a = Mf(a); null !== a; ) {
              if (c = a[Of]) return c;
              a = Mf(a);
            }
            return b;
          }
          a = c;
          c = a.parentNode;
        }
        return null;
      }
      function Cb(a) {
        a = a[Of] || a[uf];
        return !a || 5 !== a.tag && 6 !== a.tag && 13 !== a.tag && 3 !== a.tag ? null : a;
      }
      function ue(a) {
        if (5 === a.tag || 6 === a.tag) return a.stateNode;
        throw Error(p(33));
      }
      function Db(a) {
        return a[Pf] || null;
      }
      var Sf = [];
      var Tf = -1;
      function Uf(a) {
        return { current: a };
      }
      function E(a) {
        0 > Tf || (a.current = Sf[Tf], Sf[Tf] = null, Tf--);
      }
      function G(a, b) {
        Tf++;
        Sf[Tf] = a.current;
        a.current = b;
      }
      var Vf = {};
      var H = Uf(Vf);
      var Wf = Uf(false);
      var Xf = Vf;
      function Yf(a, b) {
        var c = a.type.contextTypes;
        if (!c) return Vf;
        var d = a.stateNode;
        if (d && d.__reactInternalMemoizedUnmaskedChildContext === b) return d.__reactInternalMemoizedMaskedChildContext;
        var e = {}, f;
        for (f in c) e[f] = b[f];
        d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = b, a.__reactInternalMemoizedMaskedChildContext = e);
        return e;
      }
      function Zf(a) {
        a = a.childContextTypes;
        return null !== a && void 0 !== a;
      }
      function $f() {
        E(Wf);
        E(H);
      }
      function ag(a, b, c) {
        if (H.current !== Vf) throw Error(p(168));
        G(H, b);
        G(Wf, c);
      }
      function bg(a, b, c) {
        var d = a.stateNode;
        b = b.childContextTypes;
        if ("function" !== typeof d.getChildContext) return c;
        d = d.getChildContext();
        for (var e in d) if (!(e in b)) throw Error(p(108, Ra(a) || "Unknown", e));
        return A({}, c, d);
      }
      function cg(a) {
        a = (a = a.stateNode) && a.__reactInternalMemoizedMergedChildContext || Vf;
        Xf = H.current;
        G(H, a);
        G(Wf, Wf.current);
        return true;
      }
      function dg(a, b, c) {
        var d = a.stateNode;
        if (!d) throw Error(p(169));
        c ? (a = bg(a, b, Xf), d.__reactInternalMemoizedMergedChildContext = a, E(Wf), E(H), G(H, a)) : E(Wf);
        G(Wf, c);
      }
      var eg = null;
      var fg = false;
      var gg = false;
      function hg(a) {
        null === eg ? eg = [a] : eg.push(a);
      }
      function ig(a) {
        fg = true;
        hg(a);
      }
      function jg() {
        if (!gg && null !== eg) {
          gg = true;
          var a = 0, b = C;
          try {
            var c = eg;
            for (C = 1; a < c.length; a++) {
              var d = c[a];
              do
                d = d(true);
              while (null !== d);
            }
            eg = null;
            fg = false;
          } catch (e) {
            throw null !== eg && (eg = eg.slice(a + 1)), ac(fc, jg), e;
          } finally {
            C = b, gg = false;
          }
        }
        return null;
      }
      var kg = [];
      var lg = 0;
      var mg = null;
      var ng = 0;
      var og = [];
      var pg = 0;
      var qg = null;
      var rg = 1;
      var sg = "";
      function tg(a, b) {
        kg[lg++] = ng;
        kg[lg++] = mg;
        mg = a;
        ng = b;
      }
      function ug(a, b, c) {
        og[pg++] = rg;
        og[pg++] = sg;
        og[pg++] = qg;
        qg = a;
        var d = rg;
        a = sg;
        var e = 32 - oc(d) - 1;
        d &= ~(1 << e);
        c += 1;
        var f = 32 - oc(b) + e;
        if (30 < f) {
          var g = e - e % 5;
          f = (d & (1 << g) - 1).toString(32);
          d >>= g;
          e -= g;
          rg = 1 << 32 - oc(b) + e | c << e | d;
          sg = f + a;
        } else rg = 1 << f | c << e | d, sg = a;
      }
      function vg(a) {
        null !== a.return && (tg(a, 1), ug(a, 1, 0));
      }
      function wg(a) {
        for (; a === mg; ) mg = kg[--lg], kg[lg] = null, ng = kg[--lg], kg[lg] = null;
        for (; a === qg; ) qg = og[--pg], og[pg] = null, sg = og[--pg], og[pg] = null, rg = og[--pg], og[pg] = null;
      }
      var xg = null;
      var yg = null;
      var I = false;
      var zg = null;
      function Ag(a, b) {
        var c = Bg(5, null, null, 0);
        c.elementType = "DELETED";
        c.stateNode = b;
        c.return = a;
        b = a.deletions;
        null === b ? (a.deletions = [c], a.flags |= 16) : b.push(c);
      }
      function Cg(a, b) {
        switch (a.tag) {
          case 5:
            var c = a.type;
            b = 1 !== b.nodeType || c.toLowerCase() !== b.nodeName.toLowerCase() ? null : b;
            return null !== b ? (a.stateNode = b, xg = a, yg = Lf(b.firstChild), true) : false;
          case 6:
            return b = "" === a.pendingProps || 3 !== b.nodeType ? null : b, null !== b ? (a.stateNode = b, xg = a, yg = null, true) : false;
          case 13:
            return b = 8 !== b.nodeType ? null : b, null !== b ? (c = null !== qg ? { id: rg, overflow: sg } : null, a.memoizedState = { dehydrated: b, treeContext: c, retryLane: 1073741824 }, c = Bg(18, null, null, 0), c.stateNode = b, c.return = a, a.child = c, xg = a, yg = null, true) : false;
          default:
            return false;
        }
      }
      function Dg(a) {
        return 0 !== (a.mode & 1) && 0 === (a.flags & 128);
      }
      function Eg(a) {
        if (I) {
          var b = yg;
          if (b) {
            var c = b;
            if (!Cg(a, b)) {
              if (Dg(a)) throw Error(p(418));
              b = Lf(c.nextSibling);
              var d = xg;
              b && Cg(a, b) ? Ag(d, c) : (a.flags = a.flags & -4097 | 2, I = false, xg = a);
            }
          } else {
            if (Dg(a)) throw Error(p(418));
            a.flags = a.flags & -4097 | 2;
            I = false;
            xg = a;
          }
        }
      }
      function Fg(a) {
        for (a = a.return; null !== a && 5 !== a.tag && 3 !== a.tag && 13 !== a.tag; ) a = a.return;
        xg = a;
      }
      function Gg(a) {
        if (a !== xg) return false;
        if (!I) return Fg(a), I = true, false;
        var b;
        (b = 3 !== a.tag) && !(b = 5 !== a.tag) && (b = a.type, b = "head" !== b && "body" !== b && !Ef(a.type, a.memoizedProps));
        if (b && (b = yg)) {
          if (Dg(a)) throw Hg(), Error(p(418));
          for (; b; ) Ag(a, b), b = Lf(b.nextSibling);
        }
        Fg(a);
        if (13 === a.tag) {
          a = a.memoizedState;
          a = null !== a ? a.dehydrated : null;
          if (!a) throw Error(p(317));
          a: {
            a = a.nextSibling;
            for (b = 0; a; ) {
              if (8 === a.nodeType) {
                var c = a.data;
                if ("/$" === c) {
                  if (0 === b) {
                    yg = Lf(a.nextSibling);
                    break a;
                  }
                  b--;
                } else "$" !== c && "$!" !== c && "$?" !== c || b++;
              }
              a = a.nextSibling;
            }
            yg = null;
          }
        } else yg = xg ? Lf(a.stateNode.nextSibling) : null;
        return true;
      }
      function Hg() {
        for (var a = yg; a; ) a = Lf(a.nextSibling);
      }
      function Ig() {
        yg = xg = null;
        I = false;
      }
      function Jg(a) {
        null === zg ? zg = [a] : zg.push(a);
      }
      var Kg = ua.ReactCurrentBatchConfig;
      function Lg(a, b, c) {
        a = c.ref;
        if (null !== a && "function" !== typeof a && "object" !== typeof a) {
          if (c._owner) {
            c = c._owner;
            if (c) {
              if (1 !== c.tag) throw Error(p(309));
              var d = c.stateNode;
            }
            if (!d) throw Error(p(147, a));
            var e = d, f = "" + a;
            if (null !== b && null !== b.ref && "function" === typeof b.ref && b.ref._stringRef === f) return b.ref;
            b = function(a2) {
              var b2 = e.refs;
              null === a2 ? delete b2[f] : b2[f] = a2;
            };
            b._stringRef = f;
            return b;
          }
          if ("string" !== typeof a) throw Error(p(284));
          if (!c._owner) throw Error(p(290, a));
        }
        return a;
      }
      function Mg(a, b) {
        a = Object.prototype.toString.call(b);
        throw Error(p(31, "[object Object]" === a ? "object with keys {" + Object.keys(b).join(", ") + "}" : a));
      }
      function Ng(a) {
        var b = a._init;
        return b(a._payload);
      }
      function Og(a) {
        function b(b2, c2) {
          if (a) {
            var d2 = b2.deletions;
            null === d2 ? (b2.deletions = [c2], b2.flags |= 16) : d2.push(c2);
          }
        }
        function c(c2, d2) {
          if (!a) return null;
          for (; null !== d2; ) b(c2, d2), d2 = d2.sibling;
          return null;
        }
        function d(a2, b2) {
          for (a2 = /* @__PURE__ */ new Map(); null !== b2; ) null !== b2.key ? a2.set(b2.key, b2) : a2.set(b2.index, b2), b2 = b2.sibling;
          return a2;
        }
        function e(a2, b2) {
          a2 = Pg(a2, b2);
          a2.index = 0;
          a2.sibling = null;
          return a2;
        }
        function f(b2, c2, d2) {
          b2.index = d2;
          if (!a) return b2.flags |= 1048576, c2;
          d2 = b2.alternate;
          if (null !== d2) return d2 = d2.index, d2 < c2 ? (b2.flags |= 2, c2) : d2;
          b2.flags |= 2;
          return c2;
        }
        function g(b2) {
          a && null === b2.alternate && (b2.flags |= 2);
          return b2;
        }
        function h(a2, b2, c2, d2) {
          if (null === b2 || 6 !== b2.tag) return b2 = Qg(c2, a2.mode, d2), b2.return = a2, b2;
          b2 = e(b2, c2);
          b2.return = a2;
          return b2;
        }
        function k(a2, b2, c2, d2) {
          var f2 = c2.type;
          if (f2 === ya) return m(a2, b2, c2.props.children, d2, c2.key);
          if (null !== b2 && (b2.elementType === f2 || "object" === typeof f2 && null !== f2 && f2.$$typeof === Ha && Ng(f2) === b2.type)) return d2 = e(b2, c2.props), d2.ref = Lg(a2, b2, c2), d2.return = a2, d2;
          d2 = Rg(c2.type, c2.key, c2.props, null, a2.mode, d2);
          d2.ref = Lg(a2, b2, c2);
          d2.return = a2;
          return d2;
        }
        function l(a2, b2, c2, d2) {
          if (null === b2 || 4 !== b2.tag || b2.stateNode.containerInfo !== c2.containerInfo || b2.stateNode.implementation !== c2.implementation) return b2 = Sg(c2, a2.mode, d2), b2.return = a2, b2;
          b2 = e(b2, c2.children || []);
          b2.return = a2;
          return b2;
        }
        function m(a2, b2, c2, d2, f2) {
          if (null === b2 || 7 !== b2.tag) return b2 = Tg(c2, a2.mode, d2, f2), b2.return = a2, b2;
          b2 = e(b2, c2);
          b2.return = a2;
          return b2;
        }
        function q(a2, b2, c2) {
          if ("string" === typeof b2 && "" !== b2 || "number" === typeof b2) return b2 = Qg("" + b2, a2.mode, c2), b2.return = a2, b2;
          if ("object" === typeof b2 && null !== b2) {
            switch (b2.$$typeof) {
              case va:
                return c2 = Rg(b2.type, b2.key, b2.props, null, a2.mode, c2), c2.ref = Lg(a2, null, b2), c2.return = a2, c2;
              case wa:
                return b2 = Sg(b2, a2.mode, c2), b2.return = a2, b2;
              case Ha:
                var d2 = b2._init;
                return q(a2, d2(b2._payload), c2);
            }
            if (eb(b2) || Ka(b2)) return b2 = Tg(b2, a2.mode, c2, null), b2.return = a2, b2;
            Mg(a2, b2);
          }
          return null;
        }
        function r(a2, b2, c2, d2) {
          var e2 = null !== b2 ? b2.key : null;
          if ("string" === typeof c2 && "" !== c2 || "number" === typeof c2) return null !== e2 ? null : h(a2, b2, "" + c2, d2);
          if ("object" === typeof c2 && null !== c2) {
            switch (c2.$$typeof) {
              case va:
                return c2.key === e2 ? k(a2, b2, c2, d2) : null;
              case wa:
                return c2.key === e2 ? l(a2, b2, c2, d2) : null;
              case Ha:
                return e2 = c2._init, r(
                  a2,
                  b2,
                  e2(c2._payload),
                  d2
                );
            }
            if (eb(c2) || Ka(c2)) return null !== e2 ? null : m(a2, b2, c2, d2, null);
            Mg(a2, c2);
          }
          return null;
        }
        function y(a2, b2, c2, d2, e2) {
          if ("string" === typeof d2 && "" !== d2 || "number" === typeof d2) return a2 = a2.get(c2) || null, h(b2, a2, "" + d2, e2);
          if ("object" === typeof d2 && null !== d2) {
            switch (d2.$$typeof) {
              case va:
                return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, k(b2, a2, d2, e2);
              case wa:
                return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, l(b2, a2, d2, e2);
              case Ha:
                var f2 = d2._init;
                return y(a2, b2, c2, f2(d2._payload), e2);
            }
            if (eb(d2) || Ka(d2)) return a2 = a2.get(c2) || null, m(b2, a2, d2, e2, null);
            Mg(b2, d2);
          }
          return null;
        }
        function n(e2, g2, h2, k2) {
          for (var l2 = null, m2 = null, u = g2, w = g2 = 0, x = null; null !== u && w < h2.length; w++) {
            u.index > w ? (x = u, u = null) : x = u.sibling;
            var n2 = r(e2, u, h2[w], k2);
            if (null === n2) {
              null === u && (u = x);
              break;
            }
            a && u && null === n2.alternate && b(e2, u);
            g2 = f(n2, g2, w);
            null === m2 ? l2 = n2 : m2.sibling = n2;
            m2 = n2;
            u = x;
          }
          if (w === h2.length) return c(e2, u), I && tg(e2, w), l2;
          if (null === u) {
            for (; w < h2.length; w++) u = q(e2, h2[w], k2), null !== u && (g2 = f(u, g2, w), null === m2 ? l2 = u : m2.sibling = u, m2 = u);
            I && tg(e2, w);
            return l2;
          }
          for (u = d(e2, u); w < h2.length; w++) x = y(u, e2, w, h2[w], k2), null !== x && (a && null !== x.alternate && u.delete(null === x.key ? w : x.key), g2 = f(x, g2, w), null === m2 ? l2 = x : m2.sibling = x, m2 = x);
          a && u.forEach(function(a2) {
            return b(e2, a2);
          });
          I && tg(e2, w);
          return l2;
        }
        function t(e2, g2, h2, k2) {
          var l2 = Ka(h2);
          if ("function" !== typeof l2) throw Error(p(150));
          h2 = l2.call(h2);
          if (null == h2) throw Error(p(151));
          for (var u = l2 = null, m2 = g2, w = g2 = 0, x = null, n2 = h2.next(); null !== m2 && !n2.done; w++, n2 = h2.next()) {
            m2.index > w ? (x = m2, m2 = null) : x = m2.sibling;
            var t2 = r(e2, m2, n2.value, k2);
            if (null === t2) {
              null === m2 && (m2 = x);
              break;
            }
            a && m2 && null === t2.alternate && b(e2, m2);
            g2 = f(t2, g2, w);
            null === u ? l2 = t2 : u.sibling = t2;
            u = t2;
            m2 = x;
          }
          if (n2.done) return c(
            e2,
            m2
          ), I && tg(e2, w), l2;
          if (null === m2) {
            for (; !n2.done; w++, n2 = h2.next()) n2 = q(e2, n2.value, k2), null !== n2 && (g2 = f(n2, g2, w), null === u ? l2 = n2 : u.sibling = n2, u = n2);
            I && tg(e2, w);
            return l2;
          }
          for (m2 = d(e2, m2); !n2.done; w++, n2 = h2.next()) n2 = y(m2, e2, w, n2.value, k2), null !== n2 && (a && null !== n2.alternate && m2.delete(null === n2.key ? w : n2.key), g2 = f(n2, g2, w), null === u ? l2 = n2 : u.sibling = n2, u = n2);
          a && m2.forEach(function(a2) {
            return b(e2, a2);
          });
          I && tg(e2, w);
          return l2;
        }
        function J(a2, d2, f2, h2) {
          "object" === typeof f2 && null !== f2 && f2.type === ya && null === f2.key && (f2 = f2.props.children);
          if ("object" === typeof f2 && null !== f2) {
            switch (f2.$$typeof) {
              case va:
                a: {
                  for (var k2 = f2.key, l2 = d2; null !== l2; ) {
                    if (l2.key === k2) {
                      k2 = f2.type;
                      if (k2 === ya) {
                        if (7 === l2.tag) {
                          c(a2, l2.sibling);
                          d2 = e(l2, f2.props.children);
                          d2.return = a2;
                          a2 = d2;
                          break a;
                        }
                      } else if (l2.elementType === k2 || "object" === typeof k2 && null !== k2 && k2.$$typeof === Ha && Ng(k2) === l2.type) {
                        c(a2, l2.sibling);
                        d2 = e(l2, f2.props);
                        d2.ref = Lg(a2, l2, f2);
                        d2.return = a2;
                        a2 = d2;
                        break a;
                      }
                      c(a2, l2);
                      break;
                    } else b(a2, l2);
                    l2 = l2.sibling;
                  }
                  f2.type === ya ? (d2 = Tg(f2.props.children, a2.mode, h2, f2.key), d2.return = a2, a2 = d2) : (h2 = Rg(f2.type, f2.key, f2.props, null, a2.mode, h2), h2.ref = Lg(a2, d2, f2), h2.return = a2, a2 = h2);
                }
                return g(a2);
              case wa:
                a: {
                  for (l2 = f2.key; null !== d2; ) {
                    if (d2.key === l2) if (4 === d2.tag && d2.stateNode.containerInfo === f2.containerInfo && d2.stateNode.implementation === f2.implementation) {
                      c(a2, d2.sibling);
                      d2 = e(d2, f2.children || []);
                      d2.return = a2;
                      a2 = d2;
                      break a;
                    } else {
                      c(a2, d2);
                      break;
                    }
                    else b(a2, d2);
                    d2 = d2.sibling;
                  }
                  d2 = Sg(f2, a2.mode, h2);
                  d2.return = a2;
                  a2 = d2;
                }
                return g(a2);
              case Ha:
                return l2 = f2._init, J(a2, d2, l2(f2._payload), h2);
            }
            if (eb(f2)) return n(a2, d2, f2, h2);
            if (Ka(f2)) return t(a2, d2, f2, h2);
            Mg(a2, f2);
          }
          return "string" === typeof f2 && "" !== f2 || "number" === typeof f2 ? (f2 = "" + f2, null !== d2 && 6 === d2.tag ? (c(a2, d2.sibling), d2 = e(d2, f2), d2.return = a2, a2 = d2) : (c(a2, d2), d2 = Qg(f2, a2.mode, h2), d2.return = a2, a2 = d2), g(a2)) : c(a2, d2);
        }
        return J;
      }
      var Ug = Og(true);
      var Vg = Og(false);
      var Wg = Uf(null);
      var Xg = null;
      var Yg = null;
      var Zg = null;
      function $g() {
        Zg = Yg = Xg = null;
      }
      function ah(a) {
        var b = Wg.current;
        E(Wg);
        a._currentValue = b;
      }
      function bh(a, b, c) {
        for (; null !== a; ) {
          var d = a.alternate;
          (a.childLanes & b) !== b ? (a.childLanes |= b, null !== d && (d.childLanes |= b)) : null !== d && (d.childLanes & b) !== b && (d.childLanes |= b);
          if (a === c) break;
          a = a.return;
        }
      }
      function ch(a, b) {
        Xg = a;
        Zg = Yg = null;
        a = a.dependencies;
        null !== a && null !== a.firstContext && (0 !== (a.lanes & b) && (dh = true), a.firstContext = null);
      }
      function eh(a) {
        var b = a._currentValue;
        if (Zg !== a) if (a = { context: a, memoizedValue: b, next: null }, null === Yg) {
          if (null === Xg) throw Error(p(308));
          Yg = a;
          Xg.dependencies = { lanes: 0, firstContext: a };
        } else Yg = Yg.next = a;
        return b;
      }
      var fh = null;
      function gh(a) {
        null === fh ? fh = [a] : fh.push(a);
      }
      function hh(a, b, c, d) {
        var e = b.interleaved;
        null === e ? (c.next = c, gh(b)) : (c.next = e.next, e.next = c);
        b.interleaved = c;
        return ih(a, d);
      }
      function ih(a, b) {
        a.lanes |= b;
        var c = a.alternate;
        null !== c && (c.lanes |= b);
        c = a;
        for (a = a.return; null !== a; ) a.childLanes |= b, c = a.alternate, null !== c && (c.childLanes |= b), c = a, a = a.return;
        return 3 === c.tag ? c.stateNode : null;
      }
      var jh = false;
      function kh(a) {
        a.updateQueue = { baseState: a.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
      }
      function lh(a, b) {
        a = a.updateQueue;
        b.updateQueue === a && (b.updateQueue = { baseState: a.baseState, firstBaseUpdate: a.firstBaseUpdate, lastBaseUpdate: a.lastBaseUpdate, shared: a.shared, effects: a.effects });
      }
      function mh(a, b) {
        return { eventTime: a, lane: b, tag: 0, payload: null, callback: null, next: null };
      }
      function nh(a, b, c) {
        var d = a.updateQueue;
        if (null === d) return null;
        d = d.shared;
        if (0 !== (K & 2)) {
          var e = d.pending;
          null === e ? b.next = b : (b.next = e.next, e.next = b);
          d.pending = b;
          return ih(a, c);
        }
        e = d.interleaved;
        null === e ? (b.next = b, gh(d)) : (b.next = e.next, e.next = b);
        d.interleaved = b;
        return ih(a, c);
      }
      function oh(a, b, c) {
        b = b.updateQueue;
        if (null !== b && (b = b.shared, 0 !== (c & 4194240))) {
          var d = b.lanes;
          d &= a.pendingLanes;
          c |= d;
          b.lanes = c;
          Cc(a, c);
        }
      }
      function ph(a, b) {
        var c = a.updateQueue, d = a.alternate;
        if (null !== d && (d = d.updateQueue, c === d)) {
          var e = null, f = null;
          c = c.firstBaseUpdate;
          if (null !== c) {
            do {
              var g = { eventTime: c.eventTime, lane: c.lane, tag: c.tag, payload: c.payload, callback: c.callback, next: null };
              null === f ? e = f = g : f = f.next = g;
              c = c.next;
            } while (null !== c);
            null === f ? e = f = b : f = f.next = b;
          } else e = f = b;
          c = { baseState: d.baseState, firstBaseUpdate: e, lastBaseUpdate: f, shared: d.shared, effects: d.effects };
          a.updateQueue = c;
          return;
        }
        a = c.lastBaseUpdate;
        null === a ? c.firstBaseUpdate = b : a.next = b;
        c.lastBaseUpdate = b;
      }
      function qh(a, b, c, d) {
        var e = a.updateQueue;
        jh = false;
        var f = e.firstBaseUpdate, g = e.lastBaseUpdate, h = e.shared.pending;
        if (null !== h) {
          e.shared.pending = null;
          var k = h, l = k.next;
          k.next = null;
          null === g ? f = l : g.next = l;
          g = k;
          var m = a.alternate;
          null !== m && (m = m.updateQueue, h = m.lastBaseUpdate, h !== g && (null === h ? m.firstBaseUpdate = l : h.next = l, m.lastBaseUpdate = k));
        }
        if (null !== f) {
          var q = e.baseState;
          g = 0;
          m = l = k = null;
          h = f;
          do {
            var r = h.lane, y = h.eventTime;
            if ((d & r) === r) {
              null !== m && (m = m.next = {
                eventTime: y,
                lane: 0,
                tag: h.tag,
                payload: h.payload,
                callback: h.callback,
                next: null
              });
              a: {
                var n = a, t = h;
                r = b;
                y = c;
                switch (t.tag) {
                  case 1:
                    n = t.payload;
                    if ("function" === typeof n) {
                      q = n.call(y, q, r);
                      break a;
                    }
                    q = n;
                    break a;
                  case 3:
                    n.flags = n.flags & -65537 | 128;
                  case 0:
                    n = t.payload;
                    r = "function" === typeof n ? n.call(y, q, r) : n;
                    if (null === r || void 0 === r) break a;
                    q = A({}, q, r);
                    break a;
                  case 2:
                    jh = true;
                }
              }
              null !== h.callback && 0 !== h.lane && (a.flags |= 64, r = e.effects, null === r ? e.effects = [h] : r.push(h));
            } else y = { eventTime: y, lane: r, tag: h.tag, payload: h.payload, callback: h.callback, next: null }, null === m ? (l = m = y, k = q) : m = m.next = y, g |= r;
            h = h.next;
            if (null === h) if (h = e.shared.pending, null === h) break;
            else r = h, h = r.next, r.next = null, e.lastBaseUpdate = r, e.shared.pending = null;
          } while (1);
          null === m && (k = q);
          e.baseState = k;
          e.firstBaseUpdate = l;
          e.lastBaseUpdate = m;
          b = e.shared.interleaved;
          if (null !== b) {
            e = b;
            do
              g |= e.lane, e = e.next;
            while (e !== b);
          } else null === f && (e.shared.lanes = 0);
          rh |= g;
          a.lanes = g;
          a.memoizedState = q;
        }
      }
      function sh(a, b, c) {
        a = b.effects;
        b.effects = null;
        if (null !== a) for (b = 0; b < a.length; b++) {
          var d = a[b], e = d.callback;
          if (null !== e) {
            d.callback = null;
            d = c;
            if ("function" !== typeof e) throw Error(p(191, e));
            e.call(d);
          }
        }
      }
      var th = {};
      var uh = Uf(th);
      var vh = Uf(th);
      var wh = Uf(th);
      function xh(a) {
        if (a === th) throw Error(p(174));
        return a;
      }
      function yh(a, b) {
        G(wh, b);
        G(vh, a);
        G(uh, th);
        a = b.nodeType;
        switch (a) {
          case 9:
          case 11:
            b = (b = b.documentElement) ? b.namespaceURI : lb(null, "");
            break;
          default:
            a = 8 === a ? b.parentNode : b, b = a.namespaceURI || null, a = a.tagName, b = lb(b, a);
        }
        E(uh);
        G(uh, b);
      }
      function zh() {
        E(uh);
        E(vh);
        E(wh);
      }
      function Ah(a) {
        xh(wh.current);
        var b = xh(uh.current);
        var c = lb(b, a.type);
        b !== c && (G(vh, a), G(uh, c));
      }
      function Bh(a) {
        vh.current === a && (E(uh), E(vh));
      }
      var L2 = Uf(0);
      function Ch(a) {
        for (var b = a; null !== b; ) {
          if (13 === b.tag) {
            var c = b.memoizedState;
            if (null !== c && (c = c.dehydrated, null === c || "$?" === c.data || "$!" === c.data)) return b;
          } else if (19 === b.tag && void 0 !== b.memoizedProps.revealOrder) {
            if (0 !== (b.flags & 128)) return b;
          } else if (null !== b.child) {
            b.child.return = b;
            b = b.child;
            continue;
          }
          if (b === a) break;
          for (; null === b.sibling; ) {
            if (null === b.return || b.return === a) return null;
            b = b.return;
          }
          b.sibling.return = b.return;
          b = b.sibling;
        }
        return null;
      }
      var Dh = [];
      function Eh() {
        for (var a = 0; a < Dh.length; a++) Dh[a]._workInProgressVersionPrimary = null;
        Dh.length = 0;
      }
      var Fh = ua.ReactCurrentDispatcher;
      var Gh = ua.ReactCurrentBatchConfig;
      var Hh = 0;
      var M2 = null;
      var N = null;
      var O = null;
      var Ih = false;
      var Jh = false;
      var Kh = 0;
      var Lh = 0;
      function P() {
        throw Error(p(321));
      }
      function Mh(a, b) {
        if (null === b) return false;
        for (var c = 0; c < b.length && c < a.length; c++) if (!He(a[c], b[c])) return false;
        return true;
      }
      function Nh(a, b, c, d, e, f) {
        Hh = f;
        M2 = b;
        b.memoizedState = null;
        b.updateQueue = null;
        b.lanes = 0;
        Fh.current = null === a || null === a.memoizedState ? Oh : Ph;
        a = c(d, e);
        if (Jh) {
          f = 0;
          do {
            Jh = false;
            Kh = 0;
            if (25 <= f) throw Error(p(301));
            f += 1;
            O = N = null;
            b.updateQueue = null;
            Fh.current = Qh;
            a = c(d, e);
          } while (Jh);
        }
        Fh.current = Rh;
        b = null !== N && null !== N.next;
        Hh = 0;
        O = N = M2 = null;
        Ih = false;
        if (b) throw Error(p(300));
        return a;
      }
      function Sh() {
        var a = 0 !== Kh;
        Kh = 0;
        return a;
      }
      function Th() {
        var a = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
        null === O ? M2.memoizedState = O = a : O = O.next = a;
        return O;
      }
      function Uh() {
        if (null === N) {
          var a = M2.alternate;
          a = null !== a ? a.memoizedState : null;
        } else a = N.next;
        var b = null === O ? M2.memoizedState : O.next;
        if (null !== b) O = b, N = a;
        else {
          if (null === a) throw Error(p(310));
          N = a;
          a = { memoizedState: N.memoizedState, baseState: N.baseState, baseQueue: N.baseQueue, queue: N.queue, next: null };
          null === O ? M2.memoizedState = O = a : O = O.next = a;
        }
        return O;
      }
      function Vh(a, b) {
        return "function" === typeof b ? b(a) : b;
      }
      function Wh(a) {
        var b = Uh(), c = b.queue;
        if (null === c) throw Error(p(311));
        c.lastRenderedReducer = a;
        var d = N, e = d.baseQueue, f = c.pending;
        if (null !== f) {
          if (null !== e) {
            var g = e.next;
            e.next = f.next;
            f.next = g;
          }
          d.baseQueue = e = f;
          c.pending = null;
        }
        if (null !== e) {
          f = e.next;
          d = d.baseState;
          var h = g = null, k = null, l = f;
          do {
            var m = l.lane;
            if ((Hh & m) === m) null !== k && (k = k.next = { lane: 0, action: l.action, hasEagerState: l.hasEagerState, eagerState: l.eagerState, next: null }), d = l.hasEagerState ? l.eagerState : a(d, l.action);
            else {
              var q = {
                lane: m,
                action: l.action,
                hasEagerState: l.hasEagerState,
                eagerState: l.eagerState,
                next: null
              };
              null === k ? (h = k = q, g = d) : k = k.next = q;
              M2.lanes |= m;
              rh |= m;
            }
            l = l.next;
          } while (null !== l && l !== f);
          null === k ? g = d : k.next = h;
          He(d, b.memoizedState) || (dh = true);
          b.memoizedState = d;
          b.baseState = g;
          b.baseQueue = k;
          c.lastRenderedState = d;
        }
        a = c.interleaved;
        if (null !== a) {
          e = a;
          do
            f = e.lane, M2.lanes |= f, rh |= f, e = e.next;
          while (e !== a);
        } else null === e && (c.lanes = 0);
        return [b.memoizedState, c.dispatch];
      }
      function Xh(a) {
        var b = Uh(), c = b.queue;
        if (null === c) throw Error(p(311));
        c.lastRenderedReducer = a;
        var d = c.dispatch, e = c.pending, f = b.memoizedState;
        if (null !== e) {
          c.pending = null;
          var g = e = e.next;
          do
            f = a(f, g.action), g = g.next;
          while (g !== e);
          He(f, b.memoizedState) || (dh = true);
          b.memoizedState = f;
          null === b.baseQueue && (b.baseState = f);
          c.lastRenderedState = f;
        }
        return [f, d];
      }
      function Yh() {
      }
      function Zh(a, b) {
        var c = M2, d = Uh(), e = b(), f = !He(d.memoizedState, e);
        f && (d.memoizedState = e, dh = true);
        d = d.queue;
        $h(ai.bind(null, c, d, a), [a]);
        if (d.getSnapshot !== b || f || null !== O && O.memoizedState.tag & 1) {
          c.flags |= 2048;
          bi(9, ci.bind(null, c, d, e, b), void 0, null);
          if (null === Q) throw Error(p(349));
          0 !== (Hh & 30) || di(c, b, e);
        }
        return e;
      }
      function di(a, b, c) {
        a.flags |= 16384;
        a = { getSnapshot: b, value: c };
        b = M2.updateQueue;
        null === b ? (b = { lastEffect: null, stores: null }, M2.updateQueue = b, b.stores = [a]) : (c = b.stores, null === c ? b.stores = [a] : c.push(a));
      }
      function ci(a, b, c, d) {
        b.value = c;
        b.getSnapshot = d;
        ei(b) && fi(a);
      }
      function ai(a, b, c) {
        return c(function() {
          ei(b) && fi(a);
        });
      }
      function ei(a) {
        var b = a.getSnapshot;
        a = a.value;
        try {
          var c = b();
          return !He(a, c);
        } catch (d) {
          return true;
        }
      }
      function fi(a) {
        var b = ih(a, 1);
        null !== b && gi(b, a, 1, -1);
      }
      function hi(a) {
        var b = Th();
        "function" === typeof a && (a = a());
        b.memoizedState = b.baseState = a;
        a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: Vh, lastRenderedState: a };
        b.queue = a;
        a = a.dispatch = ii.bind(null, M2, a);
        return [b.memoizedState, a];
      }
      function bi(a, b, c, d) {
        a = { tag: a, create: b, destroy: c, deps: d, next: null };
        b = M2.updateQueue;
        null === b ? (b = { lastEffect: null, stores: null }, M2.updateQueue = b, b.lastEffect = a.next = a) : (c = b.lastEffect, null === c ? b.lastEffect = a.next = a : (d = c.next, c.next = a, a.next = d, b.lastEffect = a));
        return a;
      }
      function ji() {
        return Uh().memoizedState;
      }
      function ki(a, b, c, d) {
        var e = Th();
        M2.flags |= a;
        e.memoizedState = bi(1 | b, c, void 0, void 0 === d ? null : d);
      }
      function li(a, b, c, d) {
        var e = Uh();
        d = void 0 === d ? null : d;
        var f = void 0;
        if (null !== N) {
          var g = N.memoizedState;
          f = g.destroy;
          if (null !== d && Mh(d, g.deps)) {
            e.memoizedState = bi(b, c, f, d);
            return;
          }
        }
        M2.flags |= a;
        e.memoizedState = bi(1 | b, c, f, d);
      }
      function mi(a, b) {
        return ki(8390656, 8, a, b);
      }
      function $h(a, b) {
        return li(2048, 8, a, b);
      }
      function ni(a, b) {
        return li(4, 2, a, b);
      }
      function oi(a, b) {
        return li(4, 4, a, b);
      }
      function pi(a, b) {
        if ("function" === typeof b) return a = a(), b(a), function() {
          b(null);
        };
        if (null !== b && void 0 !== b) return a = a(), b.current = a, function() {
          b.current = null;
        };
      }
      function qi(a, b, c) {
        c = null !== c && void 0 !== c ? c.concat([a]) : null;
        return li(4, 4, pi.bind(null, b, a), c);
      }
      function ri() {
      }
      function si(a, b) {
        var c = Uh();
        b = void 0 === b ? null : b;
        var d = c.memoizedState;
        if (null !== d && null !== b && Mh(b, d[1])) return d[0];
        c.memoizedState = [a, b];
        return a;
      }
      function ti(a, b) {
        var c = Uh();
        b = void 0 === b ? null : b;
        var d = c.memoizedState;
        if (null !== d && null !== b && Mh(b, d[1])) return d[0];
        a = a();
        c.memoizedState = [a, b];
        return a;
      }
      function ui(a, b, c) {
        if (0 === (Hh & 21)) return a.baseState && (a.baseState = false, dh = true), a.memoizedState = c;
        He(c, b) || (c = yc(), M2.lanes |= c, rh |= c, a.baseState = true);
        return b;
      }
      function vi(a, b) {
        var c = C;
        C = 0 !== c && 4 > c ? c : 4;
        a(true);
        var d = Gh.transition;
        Gh.transition = {};
        try {
          a(false), b();
        } finally {
          C = c, Gh.transition = d;
        }
      }
      function wi() {
        return Uh().memoizedState;
      }
      function xi(a, b, c) {
        var d = yi(a);
        c = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
        if (zi(a)) Ai(b, c);
        else if (c = hh(a, b, c, d), null !== c) {
          var e = R();
          gi(c, a, d, e);
          Bi(c, b, d);
        }
      }
      function ii(a, b, c) {
        var d = yi(a), e = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
        if (zi(a)) Ai(b, e);
        else {
          var f = a.alternate;
          if (0 === a.lanes && (null === f || 0 === f.lanes) && (f = b.lastRenderedReducer, null !== f)) try {
            var g = b.lastRenderedState, h = f(g, c);
            e.hasEagerState = true;
            e.eagerState = h;
            if (He(h, g)) {
              var k = b.interleaved;
              null === k ? (e.next = e, gh(b)) : (e.next = k.next, k.next = e);
              b.interleaved = e;
              return;
            }
          } catch (l) {
          } finally {
          }
          c = hh(a, b, e, d);
          null !== c && (e = R(), gi(c, a, d, e), Bi(c, b, d));
        }
      }
      function zi(a) {
        var b = a.alternate;
        return a === M2 || null !== b && b === M2;
      }
      function Ai(a, b) {
        Jh = Ih = true;
        var c = a.pending;
        null === c ? b.next = b : (b.next = c.next, c.next = b);
        a.pending = b;
      }
      function Bi(a, b, c) {
        if (0 !== (c & 4194240)) {
          var d = b.lanes;
          d &= a.pendingLanes;
          c |= d;
          b.lanes = c;
          Cc(a, c);
        }
      }
      var Rh = { readContext: eh, useCallback: P, useContext: P, useEffect: P, useImperativeHandle: P, useInsertionEffect: P, useLayoutEffect: P, useMemo: P, useReducer: P, useRef: P, useState: P, useDebugValue: P, useDeferredValue: P, useTransition: P, useMutableSource: P, useSyncExternalStore: P, useId: P, unstable_isNewReconciler: false };
      var Oh = { readContext: eh, useCallback: function(a, b) {
        Th().memoizedState = [a, void 0 === b ? null : b];
        return a;
      }, useContext: eh, useEffect: mi, useImperativeHandle: function(a, b, c) {
        c = null !== c && void 0 !== c ? c.concat([a]) : null;
        return ki(
          4194308,
          4,
          pi.bind(null, b, a),
          c
        );
      }, useLayoutEffect: function(a, b) {
        return ki(4194308, 4, a, b);
      }, useInsertionEffect: function(a, b) {
        return ki(4, 2, a, b);
      }, useMemo: function(a, b) {
        var c = Th();
        b = void 0 === b ? null : b;
        a = a();
        c.memoizedState = [a, b];
        return a;
      }, useReducer: function(a, b, c) {
        var d = Th();
        b = void 0 !== c ? c(b) : b;
        d.memoizedState = d.baseState = b;
        a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: a, lastRenderedState: b };
        d.queue = a;
        a = a.dispatch = xi.bind(null, M2, a);
        return [d.memoizedState, a];
      }, useRef: function(a) {
        var b = Th();
        a = { current: a };
        return b.memoizedState = a;
      }, useState: hi, useDebugValue: ri, useDeferredValue: function(a) {
        return Th().memoizedState = a;
      }, useTransition: function() {
        var a = hi(false), b = a[0];
        a = vi.bind(null, a[1]);
        Th().memoizedState = a;
        return [b, a];
      }, useMutableSource: function() {
      }, useSyncExternalStore: function(a, b, c) {
        var d = M2, e = Th();
        if (I) {
          if (void 0 === c) throw Error(p(407));
          c = c();
        } else {
          c = b();
          if (null === Q) throw Error(p(349));
          0 !== (Hh & 30) || di(d, b, c);
        }
        e.memoizedState = c;
        var f = { value: c, getSnapshot: b };
        e.queue = f;
        mi(ai.bind(
          null,
          d,
          f,
          a
        ), [a]);
        d.flags |= 2048;
        bi(9, ci.bind(null, d, f, c, b), void 0, null);
        return c;
      }, useId: function() {
        var a = Th(), b = Q.identifierPrefix;
        if (I) {
          var c = sg;
          var d = rg;
          c = (d & ~(1 << 32 - oc(d) - 1)).toString(32) + c;
          b = ":" + b + "R" + c;
          c = Kh++;
          0 < c && (b += "H" + c.toString(32));
          b += ":";
        } else c = Lh++, b = ":" + b + "r" + c.toString(32) + ":";
        return a.memoizedState = b;
      }, unstable_isNewReconciler: false };
      var Ph = {
        readContext: eh,
        useCallback: si,
        useContext: eh,
        useEffect: $h,
        useImperativeHandle: qi,
        useInsertionEffect: ni,
        useLayoutEffect: oi,
        useMemo: ti,
        useReducer: Wh,
        useRef: ji,
        useState: function() {
          return Wh(Vh);
        },
        useDebugValue: ri,
        useDeferredValue: function(a) {
          var b = Uh();
          return ui(b, N.memoizedState, a);
        },
        useTransition: function() {
          var a = Wh(Vh)[0], b = Uh().memoizedState;
          return [a, b];
        },
        useMutableSource: Yh,
        useSyncExternalStore: Zh,
        useId: wi,
        unstable_isNewReconciler: false
      };
      var Qh = { readContext: eh, useCallback: si, useContext: eh, useEffect: $h, useImperativeHandle: qi, useInsertionEffect: ni, useLayoutEffect: oi, useMemo: ti, useReducer: Xh, useRef: ji, useState: function() {
        return Xh(Vh);
      }, useDebugValue: ri, useDeferredValue: function(a) {
        var b = Uh();
        return null === N ? b.memoizedState = a : ui(b, N.memoizedState, a);
      }, useTransition: function() {
        var a = Xh(Vh)[0], b = Uh().memoizedState;
        return [a, b];
      }, useMutableSource: Yh, useSyncExternalStore: Zh, useId: wi, unstable_isNewReconciler: false };
      function Ci(a, b) {
        if (a && a.defaultProps) {
          b = A({}, b);
          a = a.defaultProps;
          for (var c in a) void 0 === b[c] && (b[c] = a[c]);
          return b;
        }
        return b;
      }
      function Di(a, b, c, d) {
        b = a.memoizedState;
        c = c(d, b);
        c = null === c || void 0 === c ? b : A({}, b, c);
        a.memoizedState = c;
        0 === a.lanes && (a.updateQueue.baseState = c);
      }
      var Ei = { isMounted: function(a) {
        return (a = a._reactInternals) ? Vb(a) === a : false;
      }, enqueueSetState: function(a, b, c) {
        a = a._reactInternals;
        var d = R(), e = yi(a), f = mh(d, e);
        f.payload = b;
        void 0 !== c && null !== c && (f.callback = c);
        b = nh(a, f, e);
        null !== b && (gi(b, a, e, d), oh(b, a, e));
      }, enqueueReplaceState: function(a, b, c) {
        a = a._reactInternals;
        var d = R(), e = yi(a), f = mh(d, e);
        f.tag = 1;
        f.payload = b;
        void 0 !== c && null !== c && (f.callback = c);
        b = nh(a, f, e);
        null !== b && (gi(b, a, e, d), oh(b, a, e));
      }, enqueueForceUpdate: function(a, b) {
        a = a._reactInternals;
        var c = R(), d = yi(a), e = mh(c, d);
        e.tag = 2;
        void 0 !== b && null !== b && (e.callback = b);
        b = nh(a, e, d);
        null !== b && (gi(b, a, d, c), oh(b, a, d));
      } };
      function Fi(a, b, c, d, e, f, g) {
        a = a.stateNode;
        return "function" === typeof a.shouldComponentUpdate ? a.shouldComponentUpdate(d, f, g) : b.prototype && b.prototype.isPureReactComponent ? !Ie(c, d) || !Ie(e, f) : true;
      }
      function Gi(a, b, c) {
        var d = false, e = Vf;
        var f = b.contextType;
        "object" === typeof f && null !== f ? f = eh(f) : (e = Zf(b) ? Xf : H.current, d = b.contextTypes, f = (d = null !== d && void 0 !== d) ? Yf(a, e) : Vf);
        b = new b(c, f);
        a.memoizedState = null !== b.state && void 0 !== b.state ? b.state : null;
        b.updater = Ei;
        a.stateNode = b;
        b._reactInternals = a;
        d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = e, a.__reactInternalMemoizedMaskedChildContext = f);
        return b;
      }
      function Hi(a, b, c, d) {
        a = b.state;
        "function" === typeof b.componentWillReceiveProps && b.componentWillReceiveProps(c, d);
        "function" === typeof b.UNSAFE_componentWillReceiveProps && b.UNSAFE_componentWillReceiveProps(c, d);
        b.state !== a && Ei.enqueueReplaceState(b, b.state, null);
      }
      function Ii(a, b, c, d) {
        var e = a.stateNode;
        e.props = c;
        e.state = a.memoizedState;
        e.refs = {};
        kh(a);
        var f = b.contextType;
        "object" === typeof f && null !== f ? e.context = eh(f) : (f = Zf(b) ? Xf : H.current, e.context = Yf(a, f));
        e.state = a.memoizedState;
        f = b.getDerivedStateFromProps;
        "function" === typeof f && (Di(a, b, f, c), e.state = a.memoizedState);
        "function" === typeof b.getDerivedStateFromProps || "function" === typeof e.getSnapshotBeforeUpdate || "function" !== typeof e.UNSAFE_componentWillMount && "function" !== typeof e.componentWillMount || (b = e.state, "function" === typeof e.componentWillMount && e.componentWillMount(), "function" === typeof e.UNSAFE_componentWillMount && e.UNSAFE_componentWillMount(), b !== e.state && Ei.enqueueReplaceState(e, e.state, null), qh(a, c, e, d), e.state = a.memoizedState);
        "function" === typeof e.componentDidMount && (a.flags |= 4194308);
      }
      function Ji(a, b) {
        try {
          var c = "", d = b;
          do
            c += Pa(d), d = d.return;
          while (d);
          var e = c;
        } catch (f) {
          e = "\nError generating stack: " + f.message + "\n" + f.stack;
        }
        return { value: a, source: b, stack: e, digest: null };
      }
      function Ki(a, b, c) {
        return { value: a, source: null, stack: null != c ? c : null, digest: null != b ? b : null };
      }
      function Li(a, b) {
        try {
          console.error(b.value);
        } catch (c) {
          setTimeout(function() {
            throw c;
          });
        }
      }
      var Mi = "function" === typeof WeakMap ? WeakMap : Map;
      function Ni(a, b, c) {
        c = mh(-1, c);
        c.tag = 3;
        c.payload = { element: null };
        var d = b.value;
        c.callback = function() {
          Oi || (Oi = true, Pi = d);
          Li(a, b);
        };
        return c;
      }
      function Qi(a, b, c) {
        c = mh(-1, c);
        c.tag = 3;
        var d = a.type.getDerivedStateFromError;
        if ("function" === typeof d) {
          var e = b.value;
          c.payload = function() {
            return d(e);
          };
          c.callback = function() {
            Li(a, b);
          };
        }
        var f = a.stateNode;
        null !== f && "function" === typeof f.componentDidCatch && (c.callback = function() {
          Li(a, b);
          "function" !== typeof d && (null === Ri ? Ri = /* @__PURE__ */ new Set([this]) : Ri.add(this));
          var c2 = b.stack;
          this.componentDidCatch(b.value, { componentStack: null !== c2 ? c2 : "" });
        });
        return c;
      }
      function Si(a, b, c) {
        var d = a.pingCache;
        if (null === d) {
          d = a.pingCache = new Mi();
          var e = /* @__PURE__ */ new Set();
          d.set(b, e);
        } else e = d.get(b), void 0 === e && (e = /* @__PURE__ */ new Set(), d.set(b, e));
        e.has(c) || (e.add(c), a = Ti.bind(null, a, b, c), b.then(a, a));
      }
      function Ui(a) {
        do {
          var b;
          if (b = 13 === a.tag) b = a.memoizedState, b = null !== b ? null !== b.dehydrated ? true : false : true;
          if (b) return a;
          a = a.return;
        } while (null !== a);
        return null;
      }
      function Vi(a, b, c, d, e) {
        if (0 === (a.mode & 1)) return a === b ? a.flags |= 65536 : (a.flags |= 128, c.flags |= 131072, c.flags &= -52805, 1 === c.tag && (null === c.alternate ? c.tag = 17 : (b = mh(-1, 1), b.tag = 2, nh(c, b, 1))), c.lanes |= 1), a;
        a.flags |= 65536;
        a.lanes = e;
        return a;
      }
      var Wi = ua.ReactCurrentOwner;
      var dh = false;
      function Xi(a, b, c, d) {
        b.child = null === a ? Vg(b, null, c, d) : Ug(b, a.child, c, d);
      }
      function Yi(a, b, c, d, e) {
        c = c.render;
        var f = b.ref;
        ch(b, e);
        d = Nh(a, b, c, d, f, e);
        c = Sh();
        if (null !== a && !dh) return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
        I && c && vg(b);
        b.flags |= 1;
        Xi(a, b, d, e);
        return b.child;
      }
      function $i(a, b, c, d, e) {
        if (null === a) {
          var f = c.type;
          if ("function" === typeof f && !aj(f) && void 0 === f.defaultProps && null === c.compare && void 0 === c.defaultProps) return b.tag = 15, b.type = f, bj(a, b, f, d, e);
          a = Rg(c.type, null, d, b, b.mode, e);
          a.ref = b.ref;
          a.return = b;
          return b.child = a;
        }
        f = a.child;
        if (0 === (a.lanes & e)) {
          var g = f.memoizedProps;
          c = c.compare;
          c = null !== c ? c : Ie;
          if (c(g, d) && a.ref === b.ref) return Zi(a, b, e);
        }
        b.flags |= 1;
        a = Pg(f, d);
        a.ref = b.ref;
        a.return = b;
        return b.child = a;
      }
      function bj(a, b, c, d, e) {
        if (null !== a) {
          var f = a.memoizedProps;
          if (Ie(f, d) && a.ref === b.ref) if (dh = false, b.pendingProps = d = f, 0 !== (a.lanes & e)) 0 !== (a.flags & 131072) && (dh = true);
          else return b.lanes = a.lanes, Zi(a, b, e);
        }
        return cj(a, b, c, d, e);
      }
      function dj(a, b, c) {
        var d = b.pendingProps, e = d.children, f = null !== a ? a.memoizedState : null;
        if ("hidden" === d.mode) if (0 === (b.mode & 1)) b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, G(ej, fj), fj |= c;
        else {
          if (0 === (c & 1073741824)) return a = null !== f ? f.baseLanes | c : c, b.lanes = b.childLanes = 1073741824, b.memoizedState = { baseLanes: a, cachePool: null, transitions: null }, b.updateQueue = null, G(ej, fj), fj |= a, null;
          b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null };
          d = null !== f ? f.baseLanes : c;
          G(ej, fj);
          fj |= d;
        }
        else null !== f ? (d = f.baseLanes | c, b.memoizedState = null) : d = c, G(ej, fj), fj |= d;
        Xi(a, b, e, c);
        return b.child;
      }
      function gj(a, b) {
        var c = b.ref;
        if (null === a && null !== c || null !== a && a.ref !== c) b.flags |= 512, b.flags |= 2097152;
      }
      function cj(a, b, c, d, e) {
        var f = Zf(c) ? Xf : H.current;
        f = Yf(b, f);
        ch(b, e);
        c = Nh(a, b, c, d, f, e);
        d = Sh();
        if (null !== a && !dh) return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
        I && d && vg(b);
        b.flags |= 1;
        Xi(a, b, c, e);
        return b.child;
      }
      function hj(a, b, c, d, e) {
        if (Zf(c)) {
          var f = true;
          cg(b);
        } else f = false;
        ch(b, e);
        if (null === b.stateNode) ij(a, b), Gi(b, c, d), Ii(b, c, d, e), d = true;
        else if (null === a) {
          var g = b.stateNode, h = b.memoizedProps;
          g.props = h;
          var k = g.context, l = c.contextType;
          "object" === typeof l && null !== l ? l = eh(l) : (l = Zf(c) ? Xf : H.current, l = Yf(b, l));
          var m = c.getDerivedStateFromProps, q = "function" === typeof m || "function" === typeof g.getSnapshotBeforeUpdate;
          q || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== d || k !== l) && Hi(b, g, d, l);
          jh = false;
          var r = b.memoizedState;
          g.state = r;
          qh(b, d, g, e);
          k = b.memoizedState;
          h !== d || r !== k || Wf.current || jh ? ("function" === typeof m && (Di(b, c, m, d), k = b.memoizedState), (h = jh || Fi(b, c, h, d, r, k, l)) ? (q || "function" !== typeof g.UNSAFE_componentWillMount && "function" !== typeof g.componentWillMount || ("function" === typeof g.componentWillMount && g.componentWillMount(), "function" === typeof g.UNSAFE_componentWillMount && g.UNSAFE_componentWillMount()), "function" === typeof g.componentDidMount && (b.flags |= 4194308)) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), b.memoizedProps = d, b.memoizedState = k), g.props = d, g.state = k, g.context = l, d = h) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), d = false);
        } else {
          g = b.stateNode;
          lh(a, b);
          h = b.memoizedProps;
          l = b.type === b.elementType ? h : Ci(b.type, h);
          g.props = l;
          q = b.pendingProps;
          r = g.context;
          k = c.contextType;
          "object" === typeof k && null !== k ? k = eh(k) : (k = Zf(c) ? Xf : H.current, k = Yf(b, k));
          var y = c.getDerivedStateFromProps;
          (m = "function" === typeof y || "function" === typeof g.getSnapshotBeforeUpdate) || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== q || r !== k) && Hi(b, g, d, k);
          jh = false;
          r = b.memoizedState;
          g.state = r;
          qh(b, d, g, e);
          var n = b.memoizedState;
          h !== q || r !== n || Wf.current || jh ? ("function" === typeof y && (Di(b, c, y, d), n = b.memoizedState), (l = jh || Fi(b, c, l, d, r, n, k) || false) ? (m || "function" !== typeof g.UNSAFE_componentWillUpdate && "function" !== typeof g.componentWillUpdate || ("function" === typeof g.componentWillUpdate && g.componentWillUpdate(d, n, k), "function" === typeof g.UNSAFE_componentWillUpdate && g.UNSAFE_componentWillUpdate(d, n, k)), "function" === typeof g.componentDidUpdate && (b.flags |= 4), "function" === typeof g.getSnapshotBeforeUpdate && (b.flags |= 1024)) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), b.memoizedProps = d, b.memoizedState = n), g.props = d, g.state = n, g.context = k, d = l) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), d = false);
        }
        return jj(a, b, c, d, f, e);
      }
      function jj(a, b, c, d, e, f) {
        gj(a, b);
        var g = 0 !== (b.flags & 128);
        if (!d && !g) return e && dg(b, c, false), Zi(a, b, f);
        d = b.stateNode;
        Wi.current = b;
        var h = g && "function" !== typeof c.getDerivedStateFromError ? null : d.render();
        b.flags |= 1;
        null !== a && g ? (b.child = Ug(b, a.child, null, f), b.child = Ug(b, null, h, f)) : Xi(a, b, h, f);
        b.memoizedState = d.state;
        e && dg(b, c, true);
        return b.child;
      }
      function kj(a) {
        var b = a.stateNode;
        b.pendingContext ? ag(a, b.pendingContext, b.pendingContext !== b.context) : b.context && ag(a, b.context, false);
        yh(a, b.containerInfo);
      }
      function lj(a, b, c, d, e) {
        Ig();
        Jg(e);
        b.flags |= 256;
        Xi(a, b, c, d);
        return b.child;
      }
      var mj = { dehydrated: null, treeContext: null, retryLane: 0 };
      function nj(a) {
        return { baseLanes: a, cachePool: null, transitions: null };
      }
      function oj(a, b, c) {
        var d = b.pendingProps, e = L2.current, f = false, g = 0 !== (b.flags & 128), h;
        (h = g) || (h = null !== a && null === a.memoizedState ? false : 0 !== (e & 2));
        if (h) f = true, b.flags &= -129;
        else if (null === a || null !== a.memoizedState) e |= 1;
        G(L2, e & 1);
        if (null === a) {
          Eg(b);
          a = b.memoizedState;
          if (null !== a && (a = a.dehydrated, null !== a)) return 0 === (b.mode & 1) ? b.lanes = 1 : "$!" === a.data ? b.lanes = 8 : b.lanes = 1073741824, null;
          g = d.children;
          a = d.fallback;
          return f ? (d = b.mode, f = b.child, g = { mode: "hidden", children: g }, 0 === (d & 1) && null !== f ? (f.childLanes = 0, f.pendingProps = g) : f = pj(g, d, 0, null), a = Tg(a, d, c, null), f.return = b, a.return = b, f.sibling = a, b.child = f, b.child.memoizedState = nj(c), b.memoizedState = mj, a) : qj(b, g);
        }
        e = a.memoizedState;
        if (null !== e && (h = e.dehydrated, null !== h)) return rj(a, b, g, d, h, e, c);
        if (f) {
          f = d.fallback;
          g = b.mode;
          e = a.child;
          h = e.sibling;
          var k = { mode: "hidden", children: d.children };
          0 === (g & 1) && b.child !== e ? (d = b.child, d.childLanes = 0, d.pendingProps = k, b.deletions = null) : (d = Pg(e, k), d.subtreeFlags = e.subtreeFlags & 14680064);
          null !== h ? f = Pg(h, f) : (f = Tg(f, g, c, null), f.flags |= 2);
          f.return = b;
          d.return = b;
          d.sibling = f;
          b.child = d;
          d = f;
          f = b.child;
          g = a.child.memoizedState;
          g = null === g ? nj(c) : { baseLanes: g.baseLanes | c, cachePool: null, transitions: g.transitions };
          f.memoizedState = g;
          f.childLanes = a.childLanes & ~c;
          b.memoizedState = mj;
          return d;
        }
        f = a.child;
        a = f.sibling;
        d = Pg(f, { mode: "visible", children: d.children });
        0 === (b.mode & 1) && (d.lanes = c);
        d.return = b;
        d.sibling = null;
        null !== a && (c = b.deletions, null === c ? (b.deletions = [a], b.flags |= 16) : c.push(a));
        b.child = d;
        b.memoizedState = null;
        return d;
      }
      function qj(a, b) {
        b = pj({ mode: "visible", children: b }, a.mode, 0, null);
        b.return = a;
        return a.child = b;
      }
      function sj(a, b, c, d) {
        null !== d && Jg(d);
        Ug(b, a.child, null, c);
        a = qj(b, b.pendingProps.children);
        a.flags |= 2;
        b.memoizedState = null;
        return a;
      }
      function rj(a, b, c, d, e, f, g) {
        if (c) {
          if (b.flags & 256) return b.flags &= -257, d = Ki(Error(p(422))), sj(a, b, g, d);
          if (null !== b.memoizedState) return b.child = a.child, b.flags |= 128, null;
          f = d.fallback;
          e = b.mode;
          d = pj({ mode: "visible", children: d.children }, e, 0, null);
          f = Tg(f, e, g, null);
          f.flags |= 2;
          d.return = b;
          f.return = b;
          d.sibling = f;
          b.child = d;
          0 !== (b.mode & 1) && Ug(b, a.child, null, g);
          b.child.memoizedState = nj(g);
          b.memoizedState = mj;
          return f;
        }
        if (0 === (b.mode & 1)) return sj(a, b, g, null);
        if ("$!" === e.data) {
          d = e.nextSibling && e.nextSibling.dataset;
          if (d) var h = d.dgst;
          d = h;
          f = Error(p(419));
          d = Ki(f, d, void 0);
          return sj(a, b, g, d);
        }
        h = 0 !== (g & a.childLanes);
        if (dh || h) {
          d = Q;
          if (null !== d) {
            switch (g & -g) {
              case 4:
                e = 2;
                break;
              case 16:
                e = 8;
                break;
              case 64:
              case 128:
              case 256:
              case 512:
              case 1024:
              case 2048:
              case 4096:
              case 8192:
              case 16384:
              case 32768:
              case 65536:
              case 131072:
              case 262144:
              case 524288:
              case 1048576:
              case 2097152:
              case 4194304:
              case 8388608:
              case 16777216:
              case 33554432:
              case 67108864:
                e = 32;
                break;
              case 536870912:
                e = 268435456;
                break;
              default:
                e = 0;
            }
            e = 0 !== (e & (d.suspendedLanes | g)) ? 0 : e;
            0 !== e && e !== f.retryLane && (f.retryLane = e, ih(a, e), gi(d, a, e, -1));
          }
          tj();
          d = Ki(Error(p(421)));
          return sj(a, b, g, d);
        }
        if ("$?" === e.data) return b.flags |= 128, b.child = a.child, b = uj.bind(null, a), e._reactRetry = b, null;
        a = f.treeContext;
        yg = Lf(e.nextSibling);
        xg = b;
        I = true;
        zg = null;
        null !== a && (og[pg++] = rg, og[pg++] = sg, og[pg++] = qg, rg = a.id, sg = a.overflow, qg = b);
        b = qj(b, d.children);
        b.flags |= 4096;
        return b;
      }
      function vj(a, b, c) {
        a.lanes |= b;
        var d = a.alternate;
        null !== d && (d.lanes |= b);
        bh(a.return, b, c);
      }
      function wj(a, b, c, d, e) {
        var f = a.memoizedState;
        null === f ? a.memoizedState = { isBackwards: b, rendering: null, renderingStartTime: 0, last: d, tail: c, tailMode: e } : (f.isBackwards = b, f.rendering = null, f.renderingStartTime = 0, f.last = d, f.tail = c, f.tailMode = e);
      }
      function xj(a, b, c) {
        var d = b.pendingProps, e = d.revealOrder, f = d.tail;
        Xi(a, b, d.children, c);
        d = L2.current;
        if (0 !== (d & 2)) d = d & 1 | 2, b.flags |= 128;
        else {
          if (null !== a && 0 !== (a.flags & 128)) a: for (a = b.child; null !== a; ) {
            if (13 === a.tag) null !== a.memoizedState && vj(a, c, b);
            else if (19 === a.tag) vj(a, c, b);
            else if (null !== a.child) {
              a.child.return = a;
              a = a.child;
              continue;
            }
            if (a === b) break a;
            for (; null === a.sibling; ) {
              if (null === a.return || a.return === b) break a;
              a = a.return;
            }
            a.sibling.return = a.return;
            a = a.sibling;
          }
          d &= 1;
        }
        G(L2, d);
        if (0 === (b.mode & 1)) b.memoizedState = null;
        else switch (e) {
          case "forwards":
            c = b.child;
            for (e = null; null !== c; ) a = c.alternate, null !== a && null === Ch(a) && (e = c), c = c.sibling;
            c = e;
            null === c ? (e = b.child, b.child = null) : (e = c.sibling, c.sibling = null);
            wj(b, false, e, c, f);
            break;
          case "backwards":
            c = null;
            e = b.child;
            for (b.child = null; null !== e; ) {
              a = e.alternate;
              if (null !== a && null === Ch(a)) {
                b.child = e;
                break;
              }
              a = e.sibling;
              e.sibling = c;
              c = e;
              e = a;
            }
            wj(b, true, c, null, f);
            break;
          case "together":
            wj(b, false, null, null, void 0);
            break;
          default:
            b.memoizedState = null;
        }
        return b.child;
      }
      function ij(a, b) {
        0 === (b.mode & 1) && null !== a && (a.alternate = null, b.alternate = null, b.flags |= 2);
      }
      function Zi(a, b, c) {
        null !== a && (b.dependencies = a.dependencies);
        rh |= b.lanes;
        if (0 === (c & b.childLanes)) return null;
        if (null !== a && b.child !== a.child) throw Error(p(153));
        if (null !== b.child) {
          a = b.child;
          c = Pg(a, a.pendingProps);
          b.child = c;
          for (c.return = b; null !== a.sibling; ) a = a.sibling, c = c.sibling = Pg(a, a.pendingProps), c.return = b;
          c.sibling = null;
        }
        return b.child;
      }
      function yj(a, b, c) {
        switch (b.tag) {
          case 3:
            kj(b);
            Ig();
            break;
          case 5:
            Ah(b);
            break;
          case 1:
            Zf(b.type) && cg(b);
            break;
          case 4:
            yh(b, b.stateNode.containerInfo);
            break;
          case 10:
            var d = b.type._context, e = b.memoizedProps.value;
            G(Wg, d._currentValue);
            d._currentValue = e;
            break;
          case 13:
            d = b.memoizedState;
            if (null !== d) {
              if (null !== d.dehydrated) return G(L2, L2.current & 1), b.flags |= 128, null;
              if (0 !== (c & b.child.childLanes)) return oj(a, b, c);
              G(L2, L2.current & 1);
              a = Zi(a, b, c);
              return null !== a ? a.sibling : null;
            }
            G(L2, L2.current & 1);
            break;
          case 19:
            d = 0 !== (c & b.childLanes);
            if (0 !== (a.flags & 128)) {
              if (d) return xj(a, b, c);
              b.flags |= 128;
            }
            e = b.memoizedState;
            null !== e && (e.rendering = null, e.tail = null, e.lastEffect = null);
            G(L2, L2.current);
            if (d) break;
            else return null;
          case 22:
          case 23:
            return b.lanes = 0, dj(a, b, c);
        }
        return Zi(a, b, c);
      }
      var zj;
      var Aj;
      var Bj;
      var Cj;
      zj = function(a, b) {
        for (var c = b.child; null !== c; ) {
          if (5 === c.tag || 6 === c.tag) a.appendChild(c.stateNode);
          else if (4 !== c.tag && null !== c.child) {
            c.child.return = c;
            c = c.child;
            continue;
          }
          if (c === b) break;
          for (; null === c.sibling; ) {
            if (null === c.return || c.return === b) return;
            c = c.return;
          }
          c.sibling.return = c.return;
          c = c.sibling;
        }
      };
      Aj = function() {
      };
      Bj = function(a, b, c, d) {
        var e = a.memoizedProps;
        if (e !== d) {
          a = b.stateNode;
          xh(uh.current);
          var f = null;
          switch (c) {
            case "input":
              e = Ya(a, e);
              d = Ya(a, d);
              f = [];
              break;
            case "select":
              e = A({}, e, { value: void 0 });
              d = A({}, d, { value: void 0 });
              f = [];
              break;
            case "textarea":
              e = gb(a, e);
              d = gb(a, d);
              f = [];
              break;
            default:
              "function" !== typeof e.onClick && "function" === typeof d.onClick && (a.onclick = Bf);
          }
          ub(c, d);
          var g;
          c = null;
          for (l in e) if (!d.hasOwnProperty(l) && e.hasOwnProperty(l) && null != e[l]) if ("style" === l) {
            var h = e[l];
            for (g in h) h.hasOwnProperty(g) && (c || (c = {}), c[g] = "");
          } else "dangerouslySetInnerHTML" !== l && "children" !== l && "suppressContentEditableWarning" !== l && "suppressHydrationWarning" !== l && "autoFocus" !== l && (ea.hasOwnProperty(l) ? f || (f = []) : (f = f || []).push(l, null));
          for (l in d) {
            var k = d[l];
            h = null != e ? e[l] : void 0;
            if (d.hasOwnProperty(l) && k !== h && (null != k || null != h)) if ("style" === l) if (h) {
              for (g in h) !h.hasOwnProperty(g) || k && k.hasOwnProperty(g) || (c || (c = {}), c[g] = "");
              for (g in k) k.hasOwnProperty(g) && h[g] !== k[g] && (c || (c = {}), c[g] = k[g]);
            } else c || (f || (f = []), f.push(
              l,
              c
            )), c = k;
            else "dangerouslySetInnerHTML" === l ? (k = k ? k.__html : void 0, h = h ? h.__html : void 0, null != k && h !== k && (f = f || []).push(l, k)) : "children" === l ? "string" !== typeof k && "number" !== typeof k || (f = f || []).push(l, "" + k) : "suppressContentEditableWarning" !== l && "suppressHydrationWarning" !== l && (ea.hasOwnProperty(l) ? (null != k && "onScroll" === l && D("scroll", a), f || h === k || (f = [])) : (f = f || []).push(l, k));
          }
          c && (f = f || []).push("style", c);
          var l = f;
          if (b.updateQueue = l) b.flags |= 4;
        }
      };
      Cj = function(a, b, c, d) {
        c !== d && (b.flags |= 4);
      };
      function Dj(a, b) {
        if (!I) switch (a.tailMode) {
          case "hidden":
            b = a.tail;
            for (var c = null; null !== b; ) null !== b.alternate && (c = b), b = b.sibling;
            null === c ? a.tail = null : c.sibling = null;
            break;
          case "collapsed":
            c = a.tail;
            for (var d = null; null !== c; ) null !== c.alternate && (d = c), c = c.sibling;
            null === d ? b || null === a.tail ? a.tail = null : a.tail.sibling = null : d.sibling = null;
        }
      }
      function S(a) {
        var b = null !== a.alternate && a.alternate.child === a.child, c = 0, d = 0;
        if (b) for (var e = a.child; null !== e; ) c |= e.lanes | e.childLanes, d |= e.subtreeFlags & 14680064, d |= e.flags & 14680064, e.return = a, e = e.sibling;
        else for (e = a.child; null !== e; ) c |= e.lanes | e.childLanes, d |= e.subtreeFlags, d |= e.flags, e.return = a, e = e.sibling;
        a.subtreeFlags |= d;
        a.childLanes = c;
        return b;
      }
      function Ej(a, b, c) {
        var d = b.pendingProps;
        wg(b);
        switch (b.tag) {
          case 2:
          case 16:
          case 15:
          case 0:
          case 11:
          case 7:
          case 8:
          case 12:
          case 9:
          case 14:
            return S(b), null;
          case 1:
            return Zf(b.type) && $f(), S(b), null;
          case 3:
            d = b.stateNode;
            zh();
            E(Wf);
            E(H);
            Eh();
            d.pendingContext && (d.context = d.pendingContext, d.pendingContext = null);
            if (null === a || null === a.child) Gg(b) ? b.flags |= 4 : null === a || a.memoizedState.isDehydrated && 0 === (b.flags & 256) || (b.flags |= 1024, null !== zg && (Fj(zg), zg = null));
            Aj(a, b);
            S(b);
            return null;
          case 5:
            Bh(b);
            var e = xh(wh.current);
            c = b.type;
            if (null !== a && null != b.stateNode) Bj(a, b, c, d, e), a.ref !== b.ref && (b.flags |= 512, b.flags |= 2097152);
            else {
              if (!d) {
                if (null === b.stateNode) throw Error(p(166));
                S(b);
                return null;
              }
              a = xh(uh.current);
              if (Gg(b)) {
                d = b.stateNode;
                c = b.type;
                var f = b.memoizedProps;
                d[Of] = b;
                d[Pf] = f;
                a = 0 !== (b.mode & 1);
                switch (c) {
                  case "dialog":
                    D("cancel", d);
                    D("close", d);
                    break;
                  case "iframe":
                  case "object":
                  case "embed":
                    D("load", d);
                    break;
                  case "video":
                  case "audio":
                    for (e = 0; e < lf.length; e++) D(lf[e], d);
                    break;
                  case "source":
                    D("error", d);
                    break;
                  case "img":
                  case "image":
                  case "link":
                    D(
                      "error",
                      d
                    );
                    D("load", d);
                    break;
                  case "details":
                    D("toggle", d);
                    break;
                  case "input":
                    Za(d, f);
                    D("invalid", d);
                    break;
                  case "select":
                    d._wrapperState = { wasMultiple: !!f.multiple };
                    D("invalid", d);
                    break;
                  case "textarea":
                    hb(d, f), D("invalid", d);
                }
                ub(c, f);
                e = null;
                for (var g in f) if (f.hasOwnProperty(g)) {
                  var h = f[g];
                  "children" === g ? "string" === typeof h ? d.textContent !== h && (true !== f.suppressHydrationWarning && Af(d.textContent, h, a), e = ["children", h]) : "number" === typeof h && d.textContent !== "" + h && (true !== f.suppressHydrationWarning && Af(
                    d.textContent,
                    h,
                    a
                  ), e = ["children", "" + h]) : ea.hasOwnProperty(g) && null != h && "onScroll" === g && D("scroll", d);
                }
                switch (c) {
                  case "input":
                    Va(d);
                    db(d, f, true);
                    break;
                  case "textarea":
                    Va(d);
                    jb(d);
                    break;
                  case "select":
                  case "option":
                    break;
                  default:
                    "function" === typeof f.onClick && (d.onclick = Bf);
                }
                d = e;
                b.updateQueue = d;
                null !== d && (b.flags |= 4);
              } else {
                g = 9 === e.nodeType ? e : e.ownerDocument;
                "http://www.w3.org/1999/xhtml" === a && (a = kb(c));
                "http://www.w3.org/1999/xhtml" === a ? "script" === c ? (a = g.createElement("div"), a.innerHTML = "<script><\/script>", a = a.removeChild(a.firstChild)) : "string" === typeof d.is ? a = g.createElement(c, { is: d.is }) : (a = g.createElement(c), "select" === c && (g = a, d.multiple ? g.multiple = true : d.size && (g.size = d.size))) : a = g.createElementNS(a, c);
                a[Of] = b;
                a[Pf] = d;
                zj(a, b, false, false);
                b.stateNode = a;
                a: {
                  g = vb(c, d);
                  switch (c) {
                    case "dialog":
                      D("cancel", a);
                      D("close", a);
                      e = d;
                      break;
                    case "iframe":
                    case "object":
                    case "embed":
                      D("load", a);
                      e = d;
                      break;
                    case "video":
                    case "audio":
                      for (e = 0; e < lf.length; e++) D(lf[e], a);
                      e = d;
                      break;
                    case "source":
                      D("error", a);
                      e = d;
                      break;
                    case "img":
                    case "image":
                    case "link":
                      D(
                        "error",
                        a
                      );
                      D("load", a);
                      e = d;
                      break;
                    case "details":
                      D("toggle", a);
                      e = d;
                      break;
                    case "input":
                      Za(a, d);
                      e = Ya(a, d);
                      D("invalid", a);
                      break;
                    case "option":
                      e = d;
                      break;
                    case "select":
                      a._wrapperState = { wasMultiple: !!d.multiple };
                      e = A({}, d, { value: void 0 });
                      D("invalid", a);
                      break;
                    case "textarea":
                      hb(a, d);
                      e = gb(a, d);
                      D("invalid", a);
                      break;
                    default:
                      e = d;
                  }
                  ub(c, e);
                  h = e;
                  for (f in h) if (h.hasOwnProperty(f)) {
                    var k = h[f];
                    "style" === f ? sb(a, k) : "dangerouslySetInnerHTML" === f ? (k = k ? k.__html : void 0, null != k && nb(a, k)) : "children" === f ? "string" === typeof k ? ("textarea" !== c || "" !== k) && ob(a, k) : "number" === typeof k && ob(a, "" + k) : "suppressContentEditableWarning" !== f && "suppressHydrationWarning" !== f && "autoFocus" !== f && (ea.hasOwnProperty(f) ? null != k && "onScroll" === f && D("scroll", a) : null != k && ta(a, f, k, g));
                  }
                  switch (c) {
                    case "input":
                      Va(a);
                      db(a, d, false);
                      break;
                    case "textarea":
                      Va(a);
                      jb(a);
                      break;
                    case "option":
                      null != d.value && a.setAttribute("value", "" + Sa(d.value));
                      break;
                    case "select":
                      a.multiple = !!d.multiple;
                      f = d.value;
                      null != f ? fb(a, !!d.multiple, f, false) : null != d.defaultValue && fb(
                        a,
                        !!d.multiple,
                        d.defaultValue,
                        true
                      );
                      break;
                    default:
                      "function" === typeof e.onClick && (a.onclick = Bf);
                  }
                  switch (c) {
                    case "button":
                    case "input":
                    case "select":
                    case "textarea":
                      d = !!d.autoFocus;
                      break a;
                    case "img":
                      d = true;
                      break a;
                    default:
                      d = false;
                  }
                }
                d && (b.flags |= 4);
              }
              null !== b.ref && (b.flags |= 512, b.flags |= 2097152);
            }
            S(b);
            return null;
          case 6:
            if (a && null != b.stateNode) Cj(a, b, a.memoizedProps, d);
            else {
              if ("string" !== typeof d && null === b.stateNode) throw Error(p(166));
              c = xh(wh.current);
              xh(uh.current);
              if (Gg(b)) {
                d = b.stateNode;
                c = b.memoizedProps;
                d[Of] = b;
                if (f = d.nodeValue !== c) {
                  if (a = xg, null !== a) switch (a.tag) {
                    case 3:
                      Af(d.nodeValue, c, 0 !== (a.mode & 1));
                      break;
                    case 5:
                      true !== a.memoizedProps.suppressHydrationWarning && Af(d.nodeValue, c, 0 !== (a.mode & 1));
                  }
                }
                f && (b.flags |= 4);
              } else d = (9 === c.nodeType ? c : c.ownerDocument).createTextNode(d), d[Of] = b, b.stateNode = d;
            }
            S(b);
            return null;
          case 13:
            E(L2);
            d = b.memoizedState;
            if (null === a || null !== a.memoizedState && null !== a.memoizedState.dehydrated) {
              if (I && null !== yg && 0 !== (b.mode & 1) && 0 === (b.flags & 128)) Hg(), Ig(), b.flags |= 98560, f = false;
              else if (f = Gg(b), null !== d && null !== d.dehydrated) {
                if (null === a) {
                  if (!f) throw Error(p(318));
                  f = b.memoizedState;
                  f = null !== f ? f.dehydrated : null;
                  if (!f) throw Error(p(317));
                  f[Of] = b;
                } else Ig(), 0 === (b.flags & 128) && (b.memoizedState = null), b.flags |= 4;
                S(b);
                f = false;
              } else null !== zg && (Fj(zg), zg = null), f = true;
              if (!f) return b.flags & 65536 ? b : null;
            }
            if (0 !== (b.flags & 128)) return b.lanes = c, b;
            d = null !== d;
            d !== (null !== a && null !== a.memoizedState) && d && (b.child.flags |= 8192, 0 !== (b.mode & 1) && (null === a || 0 !== (L2.current & 1) ? 0 === T && (T = 3) : tj()));
            null !== b.updateQueue && (b.flags |= 4);
            S(b);
            return null;
          case 4:
            return zh(), Aj(a, b), null === a && sf(b.stateNode.containerInfo), S(b), null;
          case 10:
            return ah(b.type._context), S(b), null;
          case 17:
            return Zf(b.type) && $f(), S(b), null;
          case 19:
            E(L2);
            f = b.memoizedState;
            if (null === f) return S(b), null;
            d = 0 !== (b.flags & 128);
            g = f.rendering;
            if (null === g) if (d) Dj(f, false);
            else {
              if (0 !== T || null !== a && 0 !== (a.flags & 128)) for (a = b.child; null !== a; ) {
                g = Ch(a);
                if (null !== g) {
                  b.flags |= 128;
                  Dj(f, false);
                  d = g.updateQueue;
                  null !== d && (b.updateQueue = d, b.flags |= 4);
                  b.subtreeFlags = 0;
                  d = c;
                  for (c = b.child; null !== c; ) f = c, a = d, f.flags &= 14680066, g = f.alternate, null === g ? (f.childLanes = 0, f.lanes = a, f.child = null, f.subtreeFlags = 0, f.memoizedProps = null, f.memoizedState = null, f.updateQueue = null, f.dependencies = null, f.stateNode = null) : (f.childLanes = g.childLanes, f.lanes = g.lanes, f.child = g.child, f.subtreeFlags = 0, f.deletions = null, f.memoizedProps = g.memoizedProps, f.memoizedState = g.memoizedState, f.updateQueue = g.updateQueue, f.type = g.type, a = g.dependencies, f.dependencies = null === a ? null : { lanes: a.lanes, firstContext: a.firstContext }), c = c.sibling;
                  G(L2, L2.current & 1 | 2);
                  return b.child;
                }
                a = a.sibling;
              }
              null !== f.tail && B() > Gj && (b.flags |= 128, d = true, Dj(f, false), b.lanes = 4194304);
            }
            else {
              if (!d) if (a = Ch(g), null !== a) {
                if (b.flags |= 128, d = true, c = a.updateQueue, null !== c && (b.updateQueue = c, b.flags |= 4), Dj(f, true), null === f.tail && "hidden" === f.tailMode && !g.alternate && !I) return S(b), null;
              } else 2 * B() - f.renderingStartTime > Gj && 1073741824 !== c && (b.flags |= 128, d = true, Dj(f, false), b.lanes = 4194304);
              f.isBackwards ? (g.sibling = b.child, b.child = g) : (c = f.last, null !== c ? c.sibling = g : b.child = g, f.last = g);
            }
            if (null !== f.tail) return b = f.tail, f.rendering = b, f.tail = b.sibling, f.renderingStartTime = B(), b.sibling = null, c = L2.current, G(L2, d ? c & 1 | 2 : c & 1), b;
            S(b);
            return null;
          case 22:
          case 23:
            return Hj(), d = null !== b.memoizedState, null !== a && null !== a.memoizedState !== d && (b.flags |= 8192), d && 0 !== (b.mode & 1) ? 0 !== (fj & 1073741824) && (S(b), b.subtreeFlags & 6 && (b.flags |= 8192)) : S(b), null;
          case 24:
            return null;
          case 25:
            return null;
        }
        throw Error(p(156, b.tag));
      }
      function Ij(a, b) {
        wg(b);
        switch (b.tag) {
          case 1:
            return Zf(b.type) && $f(), a = b.flags, a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
          case 3:
            return zh(), E(Wf), E(H), Eh(), a = b.flags, 0 !== (a & 65536) && 0 === (a & 128) ? (b.flags = a & -65537 | 128, b) : null;
          case 5:
            return Bh(b), null;
          case 13:
            E(L2);
            a = b.memoizedState;
            if (null !== a && null !== a.dehydrated) {
              if (null === b.alternate) throw Error(p(340));
              Ig();
            }
            a = b.flags;
            return a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
          case 19:
            return E(L2), null;
          case 4:
            return zh(), null;
          case 10:
            return ah(b.type._context), null;
          case 22:
          case 23:
            return Hj(), null;
          case 24:
            return null;
          default:
            return null;
        }
      }
      var Jj = false;
      var U = false;
      var Kj = "function" === typeof WeakSet ? WeakSet : Set;
      var V = null;
      function Lj(a, b) {
        var c = a.ref;
        if (null !== c) if ("function" === typeof c) try {
          c(null);
        } catch (d) {
          W(a, b, d);
        }
        else c.current = null;
      }
      function Mj(a, b, c) {
        try {
          c();
        } catch (d) {
          W(a, b, d);
        }
      }
      var Nj = false;
      function Oj(a, b) {
        Cf = dd;
        a = Me();
        if (Ne(a)) {
          if ("selectionStart" in a) var c = { start: a.selectionStart, end: a.selectionEnd };
          else a: {
            c = (c = a.ownerDocument) && c.defaultView || window;
            var d = c.getSelection && c.getSelection();
            if (d && 0 !== d.rangeCount) {
              c = d.anchorNode;
              var e = d.anchorOffset, f = d.focusNode;
              d = d.focusOffset;
              try {
                c.nodeType, f.nodeType;
              } catch (F) {
                c = null;
                break a;
              }
              var g = 0, h = -1, k = -1, l = 0, m = 0, q = a, r = null;
              b: for (; ; ) {
                for (var y; ; ) {
                  q !== c || 0 !== e && 3 !== q.nodeType || (h = g + e);
                  q !== f || 0 !== d && 3 !== q.nodeType || (k = g + d);
                  3 === q.nodeType && (g += q.nodeValue.length);
                  if (null === (y = q.firstChild)) break;
                  r = q;
                  q = y;
                }
                for (; ; ) {
                  if (q === a) break b;
                  r === c && ++l === e && (h = g);
                  r === f && ++m === d && (k = g);
                  if (null !== (y = q.nextSibling)) break;
                  q = r;
                  r = q.parentNode;
                }
                q = y;
              }
              c = -1 === h || -1 === k ? null : { start: h, end: k };
            } else c = null;
          }
          c = c || { start: 0, end: 0 };
        } else c = null;
        Df = { focusedElem: a, selectionRange: c };
        dd = false;
        for (V = b; null !== V; ) if (b = V, a = b.child, 0 !== (b.subtreeFlags & 1028) && null !== a) a.return = b, V = a;
        else for (; null !== V; ) {
          b = V;
          try {
            var n = b.alternate;
            if (0 !== (b.flags & 1024)) switch (b.tag) {
              case 0:
              case 11:
              case 15:
                break;
              case 1:
                if (null !== n) {
                  var t = n.memoizedProps, J = n.memoizedState, x = b.stateNode, w = x.getSnapshotBeforeUpdate(b.elementType === b.type ? t : Ci(b.type, t), J);
                  x.__reactInternalSnapshotBeforeUpdate = w;
                }
                break;
              case 3:
                var u = b.stateNode.containerInfo;
                1 === u.nodeType ? u.textContent = "" : 9 === u.nodeType && u.documentElement && u.removeChild(u.documentElement);
                break;
              case 5:
              case 6:
              case 4:
              case 17:
                break;
              default:
                throw Error(p(163));
            }
          } catch (F) {
            W(b, b.return, F);
          }
          a = b.sibling;
          if (null !== a) {
            a.return = b.return;
            V = a;
            break;
          }
          V = b.return;
        }
        n = Nj;
        Nj = false;
        return n;
      }
      function Pj(a, b, c) {
        var d = b.updateQueue;
        d = null !== d ? d.lastEffect : null;
        if (null !== d) {
          var e = d = d.next;
          do {
            if ((e.tag & a) === a) {
              var f = e.destroy;
              e.destroy = void 0;
              void 0 !== f && Mj(b, c, f);
            }
            e = e.next;
          } while (e !== d);
        }
      }
      function Qj(a, b) {
        b = b.updateQueue;
        b = null !== b ? b.lastEffect : null;
        if (null !== b) {
          var c = b = b.next;
          do {
            if ((c.tag & a) === a) {
              var d = c.create;
              c.destroy = d();
            }
            c = c.next;
          } while (c !== b);
        }
      }
      function Rj(a) {
        var b = a.ref;
        if (null !== b) {
          var c = a.stateNode;
          switch (a.tag) {
            case 5:
              a = c;
              break;
            default:
              a = c;
          }
          "function" === typeof b ? b(a) : b.current = a;
        }
      }
      function Sj(a) {
        var b = a.alternate;
        null !== b && (a.alternate = null, Sj(b));
        a.child = null;
        a.deletions = null;
        a.sibling = null;
        5 === a.tag && (b = a.stateNode, null !== b && (delete b[Of], delete b[Pf], delete b[of], delete b[Qf], delete b[Rf]));
        a.stateNode = null;
        a.return = null;
        a.dependencies = null;
        a.memoizedProps = null;
        a.memoizedState = null;
        a.pendingProps = null;
        a.stateNode = null;
        a.updateQueue = null;
      }
      function Tj(a) {
        return 5 === a.tag || 3 === a.tag || 4 === a.tag;
      }
      function Uj(a) {
        a: for (; ; ) {
          for (; null === a.sibling; ) {
            if (null === a.return || Tj(a.return)) return null;
            a = a.return;
          }
          a.sibling.return = a.return;
          for (a = a.sibling; 5 !== a.tag && 6 !== a.tag && 18 !== a.tag; ) {
            if (a.flags & 2) continue a;
            if (null === a.child || 4 === a.tag) continue a;
            else a.child.return = a, a = a.child;
          }
          if (!(a.flags & 2)) return a.stateNode;
        }
      }
      function Vj(a, b, c) {
        var d = a.tag;
        if (5 === d || 6 === d) a = a.stateNode, b ? 8 === c.nodeType ? c.parentNode.insertBefore(a, b) : c.insertBefore(a, b) : (8 === c.nodeType ? (b = c.parentNode, b.insertBefore(a, c)) : (b = c, b.appendChild(a)), c = c._reactRootContainer, null !== c && void 0 !== c || null !== b.onclick || (b.onclick = Bf));
        else if (4 !== d && (a = a.child, null !== a)) for (Vj(a, b, c), a = a.sibling; null !== a; ) Vj(a, b, c), a = a.sibling;
      }
      function Wj(a, b, c) {
        var d = a.tag;
        if (5 === d || 6 === d) a = a.stateNode, b ? c.insertBefore(a, b) : c.appendChild(a);
        else if (4 !== d && (a = a.child, null !== a)) for (Wj(a, b, c), a = a.sibling; null !== a; ) Wj(a, b, c), a = a.sibling;
      }
      var X = null;
      var Xj = false;
      function Yj(a, b, c) {
        for (c = c.child; null !== c; ) Zj(a, b, c), c = c.sibling;
      }
      function Zj(a, b, c) {
        if (lc && "function" === typeof lc.onCommitFiberUnmount) try {
          lc.onCommitFiberUnmount(kc, c);
        } catch (h) {
        }
        switch (c.tag) {
          case 5:
            U || Lj(c, b);
          case 6:
            var d = X, e = Xj;
            X = null;
            Yj(a, b, c);
            X = d;
            Xj = e;
            null !== X && (Xj ? (a = X, c = c.stateNode, 8 === a.nodeType ? a.parentNode.removeChild(c) : a.removeChild(c)) : X.removeChild(c.stateNode));
            break;
          case 18:
            null !== X && (Xj ? (a = X, c = c.stateNode, 8 === a.nodeType ? Kf(a.parentNode, c) : 1 === a.nodeType && Kf(a, c), bd(a)) : Kf(X, c.stateNode));
            break;
          case 4:
            d = X;
            e = Xj;
            X = c.stateNode.containerInfo;
            Xj = true;
            Yj(a, b, c);
            X = d;
            Xj = e;
            break;
          case 0:
          case 11:
          case 14:
          case 15:
            if (!U && (d = c.updateQueue, null !== d && (d = d.lastEffect, null !== d))) {
              e = d = d.next;
              do {
                var f = e, g = f.destroy;
                f = f.tag;
                void 0 !== g && (0 !== (f & 2) ? Mj(c, b, g) : 0 !== (f & 4) && Mj(c, b, g));
                e = e.next;
              } while (e !== d);
            }
            Yj(a, b, c);
            break;
          case 1:
            if (!U && (Lj(c, b), d = c.stateNode, "function" === typeof d.componentWillUnmount)) try {
              d.props = c.memoizedProps, d.state = c.memoizedState, d.componentWillUnmount();
            } catch (h) {
              W(c, b, h);
            }
            Yj(a, b, c);
            break;
          case 21:
            Yj(a, b, c);
            break;
          case 22:
            c.mode & 1 ? (U = (d = U) || null !== c.memoizedState, Yj(a, b, c), U = d) : Yj(a, b, c);
            break;
          default:
            Yj(a, b, c);
        }
      }
      function ak(a) {
        var b = a.updateQueue;
        if (null !== b) {
          a.updateQueue = null;
          var c = a.stateNode;
          null === c && (c = a.stateNode = new Kj());
          b.forEach(function(b2) {
            var d = bk.bind(null, a, b2);
            c.has(b2) || (c.add(b2), b2.then(d, d));
          });
        }
      }
      function ck(a, b) {
        var c = b.deletions;
        if (null !== c) for (var d = 0; d < c.length; d++) {
          var e = c[d];
          try {
            var f = a, g = b, h = g;
            a: for (; null !== h; ) {
              switch (h.tag) {
                case 5:
                  X = h.stateNode;
                  Xj = false;
                  break a;
                case 3:
                  X = h.stateNode.containerInfo;
                  Xj = true;
                  break a;
                case 4:
                  X = h.stateNode.containerInfo;
                  Xj = true;
                  break a;
              }
              h = h.return;
            }
            if (null === X) throw Error(p(160));
            Zj(f, g, e);
            X = null;
            Xj = false;
            var k = e.alternate;
            null !== k && (k.return = null);
            e.return = null;
          } catch (l) {
            W(e, b, l);
          }
        }
        if (b.subtreeFlags & 12854) for (b = b.child; null !== b; ) dk(b, a), b = b.sibling;
      }
      function dk(a, b) {
        var c = a.alternate, d = a.flags;
        switch (a.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            ck(b, a);
            ek(a);
            if (d & 4) {
              try {
                Pj(3, a, a.return), Qj(3, a);
              } catch (t) {
                W(a, a.return, t);
              }
              try {
                Pj(5, a, a.return);
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 1:
            ck(b, a);
            ek(a);
            d & 512 && null !== c && Lj(c, c.return);
            break;
          case 5:
            ck(b, a);
            ek(a);
            d & 512 && null !== c && Lj(c, c.return);
            if (a.flags & 32) {
              var e = a.stateNode;
              try {
                ob(e, "");
              } catch (t) {
                W(a, a.return, t);
              }
            }
            if (d & 4 && (e = a.stateNode, null != e)) {
              var f = a.memoizedProps, g = null !== c ? c.memoizedProps : f, h = a.type, k = a.updateQueue;
              a.updateQueue = null;
              if (null !== k) try {
                "input" === h && "radio" === f.type && null != f.name && ab(e, f);
                vb(h, g);
                var l = vb(h, f);
                for (g = 0; g < k.length; g += 2) {
                  var m = k[g], q = k[g + 1];
                  "style" === m ? sb(e, q) : "dangerouslySetInnerHTML" === m ? nb(e, q) : "children" === m ? ob(e, q) : ta(e, m, q, l);
                }
                switch (h) {
                  case "input":
                    bb(e, f);
                    break;
                  case "textarea":
                    ib(e, f);
                    break;
                  case "select":
                    var r = e._wrapperState.wasMultiple;
                    e._wrapperState.wasMultiple = !!f.multiple;
                    var y = f.value;
                    null != y ? fb(e, !!f.multiple, y, false) : r !== !!f.multiple && (null != f.defaultValue ? fb(
                      e,
                      !!f.multiple,
                      f.defaultValue,
                      true
                    ) : fb(e, !!f.multiple, f.multiple ? [] : "", false));
                }
                e[Pf] = f;
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 6:
            ck(b, a);
            ek(a);
            if (d & 4) {
              if (null === a.stateNode) throw Error(p(162));
              e = a.stateNode;
              f = a.memoizedProps;
              try {
                e.nodeValue = f;
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 3:
            ck(b, a);
            ek(a);
            if (d & 4 && null !== c && c.memoizedState.isDehydrated) try {
              bd(b.containerInfo);
            } catch (t) {
              W(a, a.return, t);
            }
            break;
          case 4:
            ck(b, a);
            ek(a);
            break;
          case 13:
            ck(b, a);
            ek(a);
            e = a.child;
            e.flags & 8192 && (f = null !== e.memoizedState, e.stateNode.isHidden = f, !f || null !== e.alternate && null !== e.alternate.memoizedState || (fk = B()));
            d & 4 && ak(a);
            break;
          case 22:
            m = null !== c && null !== c.memoizedState;
            a.mode & 1 ? (U = (l = U) || m, ck(b, a), U = l) : ck(b, a);
            ek(a);
            if (d & 8192) {
              l = null !== a.memoizedState;
              if ((a.stateNode.isHidden = l) && !m && 0 !== (a.mode & 1)) for (V = a, m = a.child; null !== m; ) {
                for (q = V = m; null !== V; ) {
                  r = V;
                  y = r.child;
                  switch (r.tag) {
                    case 0:
                    case 11:
                    case 14:
                    case 15:
                      Pj(4, r, r.return);
                      break;
                    case 1:
                      Lj(r, r.return);
                      var n = r.stateNode;
                      if ("function" === typeof n.componentWillUnmount) {
                        d = r;
                        c = r.return;
                        try {
                          b = d, n.props = b.memoizedProps, n.state = b.memoizedState, n.componentWillUnmount();
                        } catch (t) {
                          W(d, c, t);
                        }
                      }
                      break;
                    case 5:
                      Lj(r, r.return);
                      break;
                    case 22:
                      if (null !== r.memoizedState) {
                        gk(q);
                        continue;
                      }
                  }
                  null !== y ? (y.return = r, V = y) : gk(q);
                }
                m = m.sibling;
              }
              a: for (m = null, q = a; ; ) {
                if (5 === q.tag) {
                  if (null === m) {
                    m = q;
                    try {
                      e = q.stateNode, l ? (f = e.style, "function" === typeof f.setProperty ? f.setProperty("display", "none", "important") : f.display = "none") : (h = q.stateNode, k = q.memoizedProps.style, g = void 0 !== k && null !== k && k.hasOwnProperty("display") ? k.display : null, h.style.display = rb("display", g));
                    } catch (t) {
                      W(a, a.return, t);
                    }
                  }
                } else if (6 === q.tag) {
                  if (null === m) try {
                    q.stateNode.nodeValue = l ? "" : q.memoizedProps;
                  } catch (t) {
                    W(a, a.return, t);
                  }
                } else if ((22 !== q.tag && 23 !== q.tag || null === q.memoizedState || q === a) && null !== q.child) {
                  q.child.return = q;
                  q = q.child;
                  continue;
                }
                if (q === a) break a;
                for (; null === q.sibling; ) {
                  if (null === q.return || q.return === a) break a;
                  m === q && (m = null);
                  q = q.return;
                }
                m === q && (m = null);
                q.sibling.return = q.return;
                q = q.sibling;
              }
            }
            break;
          case 19:
            ck(b, a);
            ek(a);
            d & 4 && ak(a);
            break;
          case 21:
            break;
          default:
            ck(
              b,
              a
            ), ek(a);
        }
      }
      function ek(a) {
        var b = a.flags;
        if (b & 2) {
          try {
            a: {
              for (var c = a.return; null !== c; ) {
                if (Tj(c)) {
                  var d = c;
                  break a;
                }
                c = c.return;
              }
              throw Error(p(160));
            }
            switch (d.tag) {
              case 5:
                var e = d.stateNode;
                d.flags & 32 && (ob(e, ""), d.flags &= -33);
                var f = Uj(a);
                Wj(a, f, e);
                break;
              case 3:
              case 4:
                var g = d.stateNode.containerInfo, h = Uj(a);
                Vj(a, h, g);
                break;
              default:
                throw Error(p(161));
            }
          } catch (k) {
            W(a, a.return, k);
          }
          a.flags &= -3;
        }
        b & 4096 && (a.flags &= -4097);
      }
      function hk(a, b, c) {
        V = a;
        ik(a, b, c);
      }
      function ik(a, b, c) {
        for (var d = 0 !== (a.mode & 1); null !== V; ) {
          var e = V, f = e.child;
          if (22 === e.tag && d) {
            var g = null !== e.memoizedState || Jj;
            if (!g) {
              var h = e.alternate, k = null !== h && null !== h.memoizedState || U;
              h = Jj;
              var l = U;
              Jj = g;
              if ((U = k) && !l) for (V = e; null !== V; ) g = V, k = g.child, 22 === g.tag && null !== g.memoizedState ? jk(e) : null !== k ? (k.return = g, V = k) : jk(e);
              for (; null !== f; ) V = f, ik(f, b, c), f = f.sibling;
              V = e;
              Jj = h;
              U = l;
            }
            kk(a, b, c);
          } else 0 !== (e.subtreeFlags & 8772) && null !== f ? (f.return = e, V = f) : kk(a, b, c);
        }
      }
      function kk(a) {
        for (; null !== V; ) {
          var b = V;
          if (0 !== (b.flags & 8772)) {
            var c = b.alternate;
            try {
              if (0 !== (b.flags & 8772)) switch (b.tag) {
                case 0:
                case 11:
                case 15:
                  U || Qj(5, b);
                  break;
                case 1:
                  var d = b.stateNode;
                  if (b.flags & 4 && !U) if (null === c) d.componentDidMount();
                  else {
                    var e = b.elementType === b.type ? c.memoizedProps : Ci(b.type, c.memoizedProps);
                    d.componentDidUpdate(e, c.memoizedState, d.__reactInternalSnapshotBeforeUpdate);
                  }
                  var f = b.updateQueue;
                  null !== f && sh(b, f, d);
                  break;
                case 3:
                  var g = b.updateQueue;
                  if (null !== g) {
                    c = null;
                    if (null !== b.child) switch (b.child.tag) {
                      case 5:
                        c = b.child.stateNode;
                        break;
                      case 1:
                        c = b.child.stateNode;
                    }
                    sh(b, g, c);
                  }
                  break;
                case 5:
                  var h = b.stateNode;
                  if (null === c && b.flags & 4) {
                    c = h;
                    var k = b.memoizedProps;
                    switch (b.type) {
                      case "button":
                      case "input":
                      case "select":
                      case "textarea":
                        k.autoFocus && c.focus();
                        break;
                      case "img":
                        k.src && (c.src = k.src);
                    }
                  }
                  break;
                case 6:
                  break;
                case 4:
                  break;
                case 12:
                  break;
                case 13:
                  if (null === b.memoizedState) {
                    var l = b.alternate;
                    if (null !== l) {
                      var m = l.memoizedState;
                      if (null !== m) {
                        var q = m.dehydrated;
                        null !== q && bd(q);
                      }
                    }
                  }
                  break;
                case 19:
                case 17:
                case 21:
                case 22:
                case 23:
                case 25:
                  break;
                default:
                  throw Error(p(163));
              }
              U || b.flags & 512 && Rj(b);
            } catch (r) {
              W(b, b.return, r);
            }
          }
          if (b === a) {
            V = null;
            break;
          }
          c = b.sibling;
          if (null !== c) {
            c.return = b.return;
            V = c;
            break;
          }
          V = b.return;
        }
      }
      function gk(a) {
        for (; null !== V; ) {
          var b = V;
          if (b === a) {
            V = null;
            break;
          }
          var c = b.sibling;
          if (null !== c) {
            c.return = b.return;
            V = c;
            break;
          }
          V = b.return;
        }
      }
      function jk(a) {
        for (; null !== V; ) {
          var b = V;
          try {
            switch (b.tag) {
              case 0:
              case 11:
              case 15:
                var c = b.return;
                try {
                  Qj(4, b);
                } catch (k) {
                  W(b, c, k);
                }
                break;
              case 1:
                var d = b.stateNode;
                if ("function" === typeof d.componentDidMount) {
                  var e = b.return;
                  try {
                    d.componentDidMount();
                  } catch (k) {
                    W(b, e, k);
                  }
                }
                var f = b.return;
                try {
                  Rj(b);
                } catch (k) {
                  W(b, f, k);
                }
                break;
              case 5:
                var g = b.return;
                try {
                  Rj(b);
                } catch (k) {
                  W(b, g, k);
                }
            }
          } catch (k) {
            W(b, b.return, k);
          }
          if (b === a) {
            V = null;
            break;
          }
          var h = b.sibling;
          if (null !== h) {
            h.return = b.return;
            V = h;
            break;
          }
          V = b.return;
        }
      }
      var lk = Math.ceil;
      var mk = ua.ReactCurrentDispatcher;
      var nk = ua.ReactCurrentOwner;
      var ok = ua.ReactCurrentBatchConfig;
      var K = 0;
      var Q = null;
      var Y = null;
      var Z = 0;
      var fj = 0;
      var ej = Uf(0);
      var T = 0;
      var pk = null;
      var rh = 0;
      var qk = 0;
      var rk = 0;
      var sk = null;
      var tk = null;
      var fk = 0;
      var Gj = Infinity;
      var uk = null;
      var Oi = false;
      var Pi = null;
      var Ri = null;
      var vk = false;
      var wk = null;
      var xk = 0;
      var yk = 0;
      var zk = null;
      var Ak = -1;
      var Bk = 0;
      function R() {
        return 0 !== (K & 6) ? B() : -1 !== Ak ? Ak : Ak = B();
      }
      function yi(a) {
        if (0 === (a.mode & 1)) return 1;
        if (0 !== (K & 2) && 0 !== Z) return Z & -Z;
        if (null !== Kg.transition) return 0 === Bk && (Bk = yc()), Bk;
        a = C;
        if (0 !== a) return a;
        a = window.event;
        a = void 0 === a ? 16 : jd(a.type);
        return a;
      }
      function gi(a, b, c, d) {
        if (50 < yk) throw yk = 0, zk = null, Error(p(185));
        Ac(a, c, d);
        if (0 === (K & 2) || a !== Q) a === Q && (0 === (K & 2) && (qk |= c), 4 === T && Ck(a, Z)), Dk(a, d), 1 === c && 0 === K && 0 === (b.mode & 1) && (Gj = B() + 500, fg && jg());
      }
      function Dk(a, b) {
        var c = a.callbackNode;
        wc(a, b);
        var d = uc(a, a === Q ? Z : 0);
        if (0 === d) null !== c && bc(c), a.callbackNode = null, a.callbackPriority = 0;
        else if (b = d & -d, a.callbackPriority !== b) {
          null != c && bc(c);
          if (1 === b) 0 === a.tag ? ig(Ek.bind(null, a)) : hg(Ek.bind(null, a)), Jf(function() {
            0 === (K & 6) && jg();
          }), c = null;
          else {
            switch (Dc(d)) {
              case 1:
                c = fc;
                break;
              case 4:
                c = gc;
                break;
              case 16:
                c = hc;
                break;
              case 536870912:
                c = jc;
                break;
              default:
                c = hc;
            }
            c = Fk(c, Gk.bind(null, a));
          }
          a.callbackPriority = b;
          a.callbackNode = c;
        }
      }
      function Gk(a, b) {
        Ak = -1;
        Bk = 0;
        if (0 !== (K & 6)) throw Error(p(327));
        var c = a.callbackNode;
        if (Hk() && a.callbackNode !== c) return null;
        var d = uc(a, a === Q ? Z : 0);
        if (0 === d) return null;
        if (0 !== (d & 30) || 0 !== (d & a.expiredLanes) || b) b = Ik(a, d);
        else {
          b = d;
          var e = K;
          K |= 2;
          var f = Jk();
          if (Q !== a || Z !== b) uk = null, Gj = B() + 500, Kk(a, b);
          do
            try {
              Lk();
              break;
            } catch (h) {
              Mk(a, h);
            }
          while (1);
          $g();
          mk.current = f;
          K = e;
          null !== Y ? b = 0 : (Q = null, Z = 0, b = T);
        }
        if (0 !== b) {
          2 === b && (e = xc(a), 0 !== e && (d = e, b = Nk(a, e)));
          if (1 === b) throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
          if (6 === b) Ck(a, d);
          else {
            e = a.current.alternate;
            if (0 === (d & 30) && !Ok(e) && (b = Ik(a, d), 2 === b && (f = xc(a), 0 !== f && (d = f, b = Nk(a, f))), 1 === b)) throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
            a.finishedWork = e;
            a.finishedLanes = d;
            switch (b) {
              case 0:
              case 1:
                throw Error(p(345));
              case 2:
                Pk(a, tk, uk);
                break;
              case 3:
                Ck(a, d);
                if ((d & 130023424) === d && (b = fk + 500 - B(), 10 < b)) {
                  if (0 !== uc(a, 0)) break;
                  e = a.suspendedLanes;
                  if ((e & d) !== d) {
                    R();
                    a.pingedLanes |= a.suspendedLanes & e;
                    break;
                  }
                  a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), b);
                  break;
                }
                Pk(a, tk, uk);
                break;
              case 4:
                Ck(a, d);
                if ((d & 4194240) === d) break;
                b = a.eventTimes;
                for (e = -1; 0 < d; ) {
                  var g = 31 - oc(d);
                  f = 1 << g;
                  g = b[g];
                  g > e && (e = g);
                  d &= ~f;
                }
                d = e;
                d = B() - d;
                d = (120 > d ? 120 : 480 > d ? 480 : 1080 > d ? 1080 : 1920 > d ? 1920 : 3e3 > d ? 3e3 : 4320 > d ? 4320 : 1960 * lk(d / 1960)) - d;
                if (10 < d) {
                  a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), d);
                  break;
                }
                Pk(a, tk, uk);
                break;
              case 5:
                Pk(a, tk, uk);
                break;
              default:
                throw Error(p(329));
            }
          }
        }
        Dk(a, B());
        return a.callbackNode === c ? Gk.bind(null, a) : null;
      }
      function Nk(a, b) {
        var c = sk;
        a.current.memoizedState.isDehydrated && (Kk(a, b).flags |= 256);
        a = Ik(a, b);
        2 !== a && (b = tk, tk = c, null !== b && Fj(b));
        return a;
      }
      function Fj(a) {
        null === tk ? tk = a : tk.push.apply(tk, a);
      }
      function Ok(a) {
        for (var b = a; ; ) {
          if (b.flags & 16384) {
            var c = b.updateQueue;
            if (null !== c && (c = c.stores, null !== c)) for (var d = 0; d < c.length; d++) {
              var e = c[d], f = e.getSnapshot;
              e = e.value;
              try {
                if (!He(f(), e)) return false;
              } catch (g) {
                return false;
              }
            }
          }
          c = b.child;
          if (b.subtreeFlags & 16384 && null !== c) c.return = b, b = c;
          else {
            if (b === a) break;
            for (; null === b.sibling; ) {
              if (null === b.return || b.return === a) return true;
              b = b.return;
            }
            b.sibling.return = b.return;
            b = b.sibling;
          }
        }
        return true;
      }
      function Ck(a, b) {
        b &= ~rk;
        b &= ~qk;
        a.suspendedLanes |= b;
        a.pingedLanes &= ~b;
        for (a = a.expirationTimes; 0 < b; ) {
          var c = 31 - oc(b), d = 1 << c;
          a[c] = -1;
          b &= ~d;
        }
      }
      function Ek(a) {
        if (0 !== (K & 6)) throw Error(p(327));
        Hk();
        var b = uc(a, 0);
        if (0 === (b & 1)) return Dk(a, B()), null;
        var c = Ik(a, b);
        if (0 !== a.tag && 2 === c) {
          var d = xc(a);
          0 !== d && (b = d, c = Nk(a, d));
        }
        if (1 === c) throw c = pk, Kk(a, 0), Ck(a, b), Dk(a, B()), c;
        if (6 === c) throw Error(p(345));
        a.finishedWork = a.current.alternate;
        a.finishedLanes = b;
        Pk(a, tk, uk);
        Dk(a, B());
        return null;
      }
      function Qk(a, b) {
        var c = K;
        K |= 1;
        try {
          return a(b);
        } finally {
          K = c, 0 === K && (Gj = B() + 500, fg && jg());
        }
      }
      function Rk(a) {
        null !== wk && 0 === wk.tag && 0 === (K & 6) && Hk();
        var b = K;
        K |= 1;
        var c = ok.transition, d = C;
        try {
          if (ok.transition = null, C = 1, a) return a();
        } finally {
          C = d, ok.transition = c, K = b, 0 === (K & 6) && jg();
        }
      }
      function Hj() {
        fj = ej.current;
        E(ej);
      }
      function Kk(a, b) {
        a.finishedWork = null;
        a.finishedLanes = 0;
        var c = a.timeoutHandle;
        -1 !== c && (a.timeoutHandle = -1, Gf(c));
        if (null !== Y) for (c = Y.return; null !== c; ) {
          var d = c;
          wg(d);
          switch (d.tag) {
            case 1:
              d = d.type.childContextTypes;
              null !== d && void 0 !== d && $f();
              break;
            case 3:
              zh();
              E(Wf);
              E(H);
              Eh();
              break;
            case 5:
              Bh(d);
              break;
            case 4:
              zh();
              break;
            case 13:
              E(L2);
              break;
            case 19:
              E(L2);
              break;
            case 10:
              ah(d.type._context);
              break;
            case 22:
            case 23:
              Hj();
          }
          c = c.return;
        }
        Q = a;
        Y = a = Pg(a.current, null);
        Z = fj = b;
        T = 0;
        pk = null;
        rk = qk = rh = 0;
        tk = sk = null;
        if (null !== fh) {
          for (b = 0; b < fh.length; b++) if (c = fh[b], d = c.interleaved, null !== d) {
            c.interleaved = null;
            var e = d.next, f = c.pending;
            if (null !== f) {
              var g = f.next;
              f.next = e;
              d.next = g;
            }
            c.pending = d;
          }
          fh = null;
        }
        return a;
      }
      function Mk(a, b) {
        do {
          var c = Y;
          try {
            $g();
            Fh.current = Rh;
            if (Ih) {
              for (var d = M2.memoizedState; null !== d; ) {
                var e = d.queue;
                null !== e && (e.pending = null);
                d = d.next;
              }
              Ih = false;
            }
            Hh = 0;
            O = N = M2 = null;
            Jh = false;
            Kh = 0;
            nk.current = null;
            if (null === c || null === c.return) {
              T = 1;
              pk = b;
              Y = null;
              break;
            }
            a: {
              var f = a, g = c.return, h = c, k = b;
              b = Z;
              h.flags |= 32768;
              if (null !== k && "object" === typeof k && "function" === typeof k.then) {
                var l = k, m = h, q = m.tag;
                if (0 === (m.mode & 1) && (0 === q || 11 === q || 15 === q)) {
                  var r = m.alternate;
                  r ? (m.updateQueue = r.updateQueue, m.memoizedState = r.memoizedState, m.lanes = r.lanes) : (m.updateQueue = null, m.memoizedState = null);
                }
                var y = Ui(g);
                if (null !== y) {
                  y.flags &= -257;
                  Vi(y, g, h, f, b);
                  y.mode & 1 && Si(f, l, b);
                  b = y;
                  k = l;
                  var n = b.updateQueue;
                  if (null === n) {
                    var t = /* @__PURE__ */ new Set();
                    t.add(k);
                    b.updateQueue = t;
                  } else n.add(k);
                  break a;
                } else {
                  if (0 === (b & 1)) {
                    Si(f, l, b);
                    tj();
                    break a;
                  }
                  k = Error(p(426));
                }
              } else if (I && h.mode & 1) {
                var J = Ui(g);
                if (null !== J) {
                  0 === (J.flags & 65536) && (J.flags |= 256);
                  Vi(J, g, h, f, b);
                  Jg(Ji(k, h));
                  break a;
                }
              }
              f = k = Ji(k, h);
              4 !== T && (T = 2);
              null === sk ? sk = [f] : sk.push(f);
              f = g;
              do {
                switch (f.tag) {
                  case 3:
                    f.flags |= 65536;
                    b &= -b;
                    f.lanes |= b;
                    var x = Ni(f, k, b);
                    ph(f, x);
                    break a;
                  case 1:
                    h = k;
                    var w = f.type, u = f.stateNode;
                    if (0 === (f.flags & 128) && ("function" === typeof w.getDerivedStateFromError || null !== u && "function" === typeof u.componentDidCatch && (null === Ri || !Ri.has(u)))) {
                      f.flags |= 65536;
                      b &= -b;
                      f.lanes |= b;
                      var F = Qi(f, h, b);
                      ph(f, F);
                      break a;
                    }
                }
                f = f.return;
              } while (null !== f);
            }
            Sk(c);
          } catch (na) {
            b = na;
            Y === c && null !== c && (Y = c = c.return);
            continue;
          }
          break;
        } while (1);
      }
      function Jk() {
        var a = mk.current;
        mk.current = Rh;
        return null === a ? Rh : a;
      }
      function tj() {
        if (0 === T || 3 === T || 2 === T) T = 4;
        null === Q || 0 === (rh & 268435455) && 0 === (qk & 268435455) || Ck(Q, Z);
      }
      function Ik(a, b) {
        var c = K;
        K |= 2;
        var d = Jk();
        if (Q !== a || Z !== b) uk = null, Kk(a, b);
        do
          try {
            Tk();
            break;
          } catch (e) {
            Mk(a, e);
          }
        while (1);
        $g();
        K = c;
        mk.current = d;
        if (null !== Y) throw Error(p(261));
        Q = null;
        Z = 0;
        return T;
      }
      function Tk() {
        for (; null !== Y; ) Uk(Y);
      }
      function Lk() {
        for (; null !== Y && !cc(); ) Uk(Y);
      }
      function Uk(a) {
        var b = Vk(a.alternate, a, fj);
        a.memoizedProps = a.pendingProps;
        null === b ? Sk(a) : Y = b;
        nk.current = null;
      }
      function Sk(a) {
        var b = a;
        do {
          var c = b.alternate;
          a = b.return;
          if (0 === (b.flags & 32768)) {
            if (c = Ej(c, b, fj), null !== c) {
              Y = c;
              return;
            }
          } else {
            c = Ij(c, b);
            if (null !== c) {
              c.flags &= 32767;
              Y = c;
              return;
            }
            if (null !== a) a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null;
            else {
              T = 6;
              Y = null;
              return;
            }
          }
          b = b.sibling;
          if (null !== b) {
            Y = b;
            return;
          }
          Y = b = a;
        } while (null !== b);
        0 === T && (T = 5);
      }
      function Pk(a, b, c) {
        var d = C, e = ok.transition;
        try {
          ok.transition = null, C = 1, Wk(a, b, c, d);
        } finally {
          ok.transition = e, C = d;
        }
        return null;
      }
      function Wk(a, b, c, d) {
        do
          Hk();
        while (null !== wk);
        if (0 !== (K & 6)) throw Error(p(327));
        c = a.finishedWork;
        var e = a.finishedLanes;
        if (null === c) return null;
        a.finishedWork = null;
        a.finishedLanes = 0;
        if (c === a.current) throw Error(p(177));
        a.callbackNode = null;
        a.callbackPriority = 0;
        var f = c.lanes | c.childLanes;
        Bc(a, f);
        a === Q && (Y = Q = null, Z = 0);
        0 === (c.subtreeFlags & 2064) && 0 === (c.flags & 2064) || vk || (vk = true, Fk(hc, function() {
          Hk();
          return null;
        }));
        f = 0 !== (c.flags & 15990);
        if (0 !== (c.subtreeFlags & 15990) || f) {
          f = ok.transition;
          ok.transition = null;
          var g = C;
          C = 1;
          var h = K;
          K |= 4;
          nk.current = null;
          Oj(a, c);
          dk(c, a);
          Oe(Df);
          dd = !!Cf;
          Df = Cf = null;
          a.current = c;
          hk(c, a, e);
          dc();
          K = h;
          C = g;
          ok.transition = f;
        } else a.current = c;
        vk && (vk = false, wk = a, xk = e);
        f = a.pendingLanes;
        0 === f && (Ri = null);
        mc(c.stateNode, d);
        Dk(a, B());
        if (null !== b) for (d = a.onRecoverableError, c = 0; c < b.length; c++) e = b[c], d(e.value, { componentStack: e.stack, digest: e.digest });
        if (Oi) throw Oi = false, a = Pi, Pi = null, a;
        0 !== (xk & 1) && 0 !== a.tag && Hk();
        f = a.pendingLanes;
        0 !== (f & 1) ? a === zk ? yk++ : (yk = 0, zk = a) : yk = 0;
        jg();
        return null;
      }
      function Hk() {
        if (null !== wk) {
          var a = Dc(xk), b = ok.transition, c = C;
          try {
            ok.transition = null;
            C = 16 > a ? 16 : a;
            if (null === wk) var d = false;
            else {
              a = wk;
              wk = null;
              xk = 0;
              if (0 !== (K & 6)) throw Error(p(331));
              var e = K;
              K |= 4;
              for (V = a.current; null !== V; ) {
                var f = V, g = f.child;
                if (0 !== (V.flags & 16)) {
                  var h = f.deletions;
                  if (null !== h) {
                    for (var k = 0; k < h.length; k++) {
                      var l = h[k];
                      for (V = l; null !== V; ) {
                        var m = V;
                        switch (m.tag) {
                          case 0:
                          case 11:
                          case 15:
                            Pj(8, m, f);
                        }
                        var q = m.child;
                        if (null !== q) q.return = m, V = q;
                        else for (; null !== V; ) {
                          m = V;
                          var r = m.sibling, y = m.return;
                          Sj(m);
                          if (m === l) {
                            V = null;
                            break;
                          }
                          if (null !== r) {
                            r.return = y;
                            V = r;
                            break;
                          }
                          V = y;
                        }
                      }
                    }
                    var n = f.alternate;
                    if (null !== n) {
                      var t = n.child;
                      if (null !== t) {
                        n.child = null;
                        do {
                          var J = t.sibling;
                          t.sibling = null;
                          t = J;
                        } while (null !== t);
                      }
                    }
                    V = f;
                  }
                }
                if (0 !== (f.subtreeFlags & 2064) && null !== g) g.return = f, V = g;
                else b: for (; null !== V; ) {
                  f = V;
                  if (0 !== (f.flags & 2048)) switch (f.tag) {
                    case 0:
                    case 11:
                    case 15:
                      Pj(9, f, f.return);
                  }
                  var x = f.sibling;
                  if (null !== x) {
                    x.return = f.return;
                    V = x;
                    break b;
                  }
                  V = f.return;
                }
              }
              var w = a.current;
              for (V = w; null !== V; ) {
                g = V;
                var u = g.child;
                if (0 !== (g.subtreeFlags & 2064) && null !== u) u.return = g, V = u;
                else b: for (g = w; null !== V; ) {
                  h = V;
                  if (0 !== (h.flags & 2048)) try {
                    switch (h.tag) {
                      case 0:
                      case 11:
                      case 15:
                        Qj(9, h);
                    }
                  } catch (na) {
                    W(h, h.return, na);
                  }
                  if (h === g) {
                    V = null;
                    break b;
                  }
                  var F = h.sibling;
                  if (null !== F) {
                    F.return = h.return;
                    V = F;
                    break b;
                  }
                  V = h.return;
                }
              }
              K = e;
              jg();
              if (lc && "function" === typeof lc.onPostCommitFiberRoot) try {
                lc.onPostCommitFiberRoot(kc, a);
              } catch (na) {
              }
              d = true;
            }
            return d;
          } finally {
            C = c, ok.transition = b;
          }
        }
        return false;
      }
      function Xk(a, b, c) {
        b = Ji(c, b);
        b = Ni(a, b, 1);
        a = nh(a, b, 1);
        b = R();
        null !== a && (Ac(a, 1, b), Dk(a, b));
      }
      function W(a, b, c) {
        if (3 === a.tag) Xk(a, a, c);
        else for (; null !== b; ) {
          if (3 === b.tag) {
            Xk(b, a, c);
            break;
          } else if (1 === b.tag) {
            var d = b.stateNode;
            if ("function" === typeof b.type.getDerivedStateFromError || "function" === typeof d.componentDidCatch && (null === Ri || !Ri.has(d))) {
              a = Ji(c, a);
              a = Qi(b, a, 1);
              b = nh(b, a, 1);
              a = R();
              null !== b && (Ac(b, 1, a), Dk(b, a));
              break;
            }
          }
          b = b.return;
        }
      }
      function Ti(a, b, c) {
        var d = a.pingCache;
        null !== d && d.delete(b);
        b = R();
        a.pingedLanes |= a.suspendedLanes & c;
        Q === a && (Z & c) === c && (4 === T || 3 === T && (Z & 130023424) === Z && 500 > B() - fk ? Kk(a, 0) : rk |= c);
        Dk(a, b);
      }
      function Yk(a, b) {
        0 === b && (0 === (a.mode & 1) ? b = 1 : (b = sc, sc <<= 1, 0 === (sc & 130023424) && (sc = 4194304)));
        var c = R();
        a = ih(a, b);
        null !== a && (Ac(a, b, c), Dk(a, c));
      }
      function uj(a) {
        var b = a.memoizedState, c = 0;
        null !== b && (c = b.retryLane);
        Yk(a, c);
      }
      function bk(a, b) {
        var c = 0;
        switch (a.tag) {
          case 13:
            var d = a.stateNode;
            var e = a.memoizedState;
            null !== e && (c = e.retryLane);
            break;
          case 19:
            d = a.stateNode;
            break;
          default:
            throw Error(p(314));
        }
        null !== d && d.delete(b);
        Yk(a, c);
      }
      var Vk;
      Vk = function(a, b, c) {
        if (null !== a) if (a.memoizedProps !== b.pendingProps || Wf.current) dh = true;
        else {
          if (0 === (a.lanes & c) && 0 === (b.flags & 128)) return dh = false, yj(a, b, c);
          dh = 0 !== (a.flags & 131072) ? true : false;
        }
        else dh = false, I && 0 !== (b.flags & 1048576) && ug(b, ng, b.index);
        b.lanes = 0;
        switch (b.tag) {
          case 2:
            var d = b.type;
            ij(a, b);
            a = b.pendingProps;
            var e = Yf(b, H.current);
            ch(b, c);
            e = Nh(null, b, d, a, e, c);
            var f = Sh();
            b.flags |= 1;
            "object" === typeof e && null !== e && "function" === typeof e.render && void 0 === e.$$typeof ? (b.tag = 1, b.memoizedState = null, b.updateQueue = null, Zf(d) ? (f = true, cg(b)) : f = false, b.memoizedState = null !== e.state && void 0 !== e.state ? e.state : null, kh(b), e.updater = Ei, b.stateNode = e, e._reactInternals = b, Ii(b, d, a, c), b = jj(null, b, d, true, f, c)) : (b.tag = 0, I && f && vg(b), Xi(null, b, e, c), b = b.child);
            return b;
          case 16:
            d = b.elementType;
            a: {
              ij(a, b);
              a = b.pendingProps;
              e = d._init;
              d = e(d._payload);
              b.type = d;
              e = b.tag = Zk(d);
              a = Ci(d, a);
              switch (e) {
                case 0:
                  b = cj(null, b, d, a, c);
                  break a;
                case 1:
                  b = hj(null, b, d, a, c);
                  break a;
                case 11:
                  b = Yi(null, b, d, a, c);
                  break a;
                case 14:
                  b = $i(null, b, d, Ci(d.type, a), c);
                  break a;
              }
              throw Error(p(
                306,
                d,
                ""
              ));
            }
            return b;
          case 0:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), cj(a, b, d, e, c);
          case 1:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), hj(a, b, d, e, c);
          case 3:
            a: {
              kj(b);
              if (null === a) throw Error(p(387));
              d = b.pendingProps;
              f = b.memoizedState;
              e = f.element;
              lh(a, b);
              qh(b, d, null, c);
              var g = b.memoizedState;
              d = g.element;
              if (f.isDehydrated) if (f = { element: d, isDehydrated: false, cache: g.cache, pendingSuspenseBoundaries: g.pendingSuspenseBoundaries, transitions: g.transitions }, b.updateQueue.baseState = f, b.memoizedState = f, b.flags & 256) {
                e = Ji(Error(p(423)), b);
                b = lj(a, b, d, c, e);
                break a;
              } else if (d !== e) {
                e = Ji(Error(p(424)), b);
                b = lj(a, b, d, c, e);
                break a;
              } else for (yg = Lf(b.stateNode.containerInfo.firstChild), xg = b, I = true, zg = null, c = Vg(b, null, d, c), b.child = c; c; ) c.flags = c.flags & -3 | 4096, c = c.sibling;
              else {
                Ig();
                if (d === e) {
                  b = Zi(a, b, c);
                  break a;
                }
                Xi(a, b, d, c);
              }
              b = b.child;
            }
            return b;
          case 5:
            return Ah(b), null === a && Eg(b), d = b.type, e = b.pendingProps, f = null !== a ? a.memoizedProps : null, g = e.children, Ef(d, e) ? g = null : null !== f && Ef(d, f) && (b.flags |= 32), gj(a, b), Xi(a, b, g, c), b.child;
          case 6:
            return null === a && Eg(b), null;
          case 13:
            return oj(a, b, c);
          case 4:
            return yh(b, b.stateNode.containerInfo), d = b.pendingProps, null === a ? b.child = Ug(b, null, d, c) : Xi(a, b, d, c), b.child;
          case 11:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), Yi(a, b, d, e, c);
          case 7:
            return Xi(a, b, b.pendingProps, c), b.child;
          case 8:
            return Xi(a, b, b.pendingProps.children, c), b.child;
          case 12:
            return Xi(a, b, b.pendingProps.children, c), b.child;
          case 10:
            a: {
              d = b.type._context;
              e = b.pendingProps;
              f = b.memoizedProps;
              g = e.value;
              G(Wg, d._currentValue);
              d._currentValue = g;
              if (null !== f) if (He(f.value, g)) {
                if (f.children === e.children && !Wf.current) {
                  b = Zi(a, b, c);
                  break a;
                }
              } else for (f = b.child, null !== f && (f.return = b); null !== f; ) {
                var h = f.dependencies;
                if (null !== h) {
                  g = f.child;
                  for (var k = h.firstContext; null !== k; ) {
                    if (k.context === d) {
                      if (1 === f.tag) {
                        k = mh(-1, c & -c);
                        k.tag = 2;
                        var l = f.updateQueue;
                        if (null !== l) {
                          l = l.shared;
                          var m = l.pending;
                          null === m ? k.next = k : (k.next = m.next, m.next = k);
                          l.pending = k;
                        }
                      }
                      f.lanes |= c;
                      k = f.alternate;
                      null !== k && (k.lanes |= c);
                      bh(
                        f.return,
                        c,
                        b
                      );
                      h.lanes |= c;
                      break;
                    }
                    k = k.next;
                  }
                } else if (10 === f.tag) g = f.type === b.type ? null : f.child;
                else if (18 === f.tag) {
                  g = f.return;
                  if (null === g) throw Error(p(341));
                  g.lanes |= c;
                  h = g.alternate;
                  null !== h && (h.lanes |= c);
                  bh(g, c, b);
                  g = f.sibling;
                } else g = f.child;
                if (null !== g) g.return = f;
                else for (g = f; null !== g; ) {
                  if (g === b) {
                    g = null;
                    break;
                  }
                  f = g.sibling;
                  if (null !== f) {
                    f.return = g.return;
                    g = f;
                    break;
                  }
                  g = g.return;
                }
                f = g;
              }
              Xi(a, b, e.children, c);
              b = b.child;
            }
            return b;
          case 9:
            return e = b.type, d = b.pendingProps.children, ch(b, c), e = eh(e), d = d(e), b.flags |= 1, Xi(a, b, d, c), b.child;
          case 14:
            return d = b.type, e = Ci(d, b.pendingProps), e = Ci(d.type, e), $i(a, b, d, e, c);
          case 15:
            return bj(a, b, b.type, b.pendingProps, c);
          case 17:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), ij(a, b), b.tag = 1, Zf(d) ? (a = true, cg(b)) : a = false, ch(b, c), Gi(b, d, e), Ii(b, d, e, c), jj(null, b, d, true, a, c);
          case 19:
            return xj(a, b, c);
          case 22:
            return dj(a, b, c);
        }
        throw Error(p(156, b.tag));
      };
      function Fk(a, b) {
        return ac(a, b);
      }
      function $k(a, b, c, d) {
        this.tag = a;
        this.key = c;
        this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
        this.index = 0;
        this.ref = null;
        this.pendingProps = b;
        this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
        this.mode = d;
        this.subtreeFlags = this.flags = 0;
        this.deletions = null;
        this.childLanes = this.lanes = 0;
        this.alternate = null;
      }
      function Bg(a, b, c, d) {
        return new $k(a, b, c, d);
      }
      function aj(a) {
        a = a.prototype;
        return !(!a || !a.isReactComponent);
      }
      function Zk(a) {
        if ("function" === typeof a) return aj(a) ? 1 : 0;
        if (void 0 !== a && null !== a) {
          a = a.$$typeof;
          if (a === Da) return 11;
          if (a === Ga) return 14;
        }
        return 2;
      }
      function Pg(a, b) {
        var c = a.alternate;
        null === c ? (c = Bg(a.tag, b, a.key, a.mode), c.elementType = a.elementType, c.type = a.type, c.stateNode = a.stateNode, c.alternate = a, a.alternate = c) : (c.pendingProps = b, c.type = a.type, c.flags = 0, c.subtreeFlags = 0, c.deletions = null);
        c.flags = a.flags & 14680064;
        c.childLanes = a.childLanes;
        c.lanes = a.lanes;
        c.child = a.child;
        c.memoizedProps = a.memoizedProps;
        c.memoizedState = a.memoizedState;
        c.updateQueue = a.updateQueue;
        b = a.dependencies;
        c.dependencies = null === b ? null : { lanes: b.lanes, firstContext: b.firstContext };
        c.sibling = a.sibling;
        c.index = a.index;
        c.ref = a.ref;
        return c;
      }
      function Rg(a, b, c, d, e, f) {
        var g = 2;
        d = a;
        if ("function" === typeof a) aj(a) && (g = 1);
        else if ("string" === typeof a) g = 5;
        else a: switch (a) {
          case ya:
            return Tg(c.children, e, f, b);
          case za:
            g = 8;
            e |= 8;
            break;
          case Aa:
            return a = Bg(12, c, b, e | 2), a.elementType = Aa, a.lanes = f, a;
          case Ea:
            return a = Bg(13, c, b, e), a.elementType = Ea, a.lanes = f, a;
          case Fa:
            return a = Bg(19, c, b, e), a.elementType = Fa, a.lanes = f, a;
          case Ia:
            return pj(c, e, f, b);
          default:
            if ("object" === typeof a && null !== a) switch (a.$$typeof) {
              case Ba:
                g = 10;
                break a;
              case Ca:
                g = 9;
                break a;
              case Da:
                g = 11;
                break a;
              case Ga:
                g = 14;
                break a;
              case Ha:
                g = 16;
                d = null;
                break a;
            }
            throw Error(p(130, null == a ? a : typeof a, ""));
        }
        b = Bg(g, c, b, e);
        b.elementType = a;
        b.type = d;
        b.lanes = f;
        return b;
      }
      function Tg(a, b, c, d) {
        a = Bg(7, a, d, b);
        a.lanes = c;
        return a;
      }
      function pj(a, b, c, d) {
        a = Bg(22, a, d, b);
        a.elementType = Ia;
        a.lanes = c;
        a.stateNode = { isHidden: false };
        return a;
      }
      function Qg(a, b, c) {
        a = Bg(6, a, null, b);
        a.lanes = c;
        return a;
      }
      function Sg(a, b, c) {
        b = Bg(4, null !== a.children ? a.children : [], a.key, b);
        b.lanes = c;
        b.stateNode = { containerInfo: a.containerInfo, pendingChildren: null, implementation: a.implementation };
        return b;
      }
      function al(a, b, c, d, e) {
        this.tag = b;
        this.containerInfo = a;
        this.finishedWork = this.pingCache = this.current = this.pendingChildren = null;
        this.timeoutHandle = -1;
        this.callbackNode = this.pendingContext = this.context = null;
        this.callbackPriority = 0;
        this.eventTimes = zc(0);
        this.expirationTimes = zc(-1);
        this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
        this.entanglements = zc(0);
        this.identifierPrefix = d;
        this.onRecoverableError = e;
        this.mutableSourceEagerHydrationData = null;
      }
      function bl(a, b, c, d, e, f, g, h, k) {
        a = new al(a, b, c, h, k);
        1 === b ? (b = 1, true === f && (b |= 8)) : b = 0;
        f = Bg(3, null, null, b);
        a.current = f;
        f.stateNode = a;
        f.memoizedState = { element: d, isDehydrated: c, cache: null, transitions: null, pendingSuspenseBoundaries: null };
        kh(f);
        return a;
      }
      function cl(a, b, c) {
        var d = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
        return { $$typeof: wa, key: null == d ? null : "" + d, children: a, containerInfo: b, implementation: c };
      }
      function dl(a) {
        if (!a) return Vf;
        a = a._reactInternals;
        a: {
          if (Vb(a) !== a || 1 !== a.tag) throw Error(p(170));
          var b = a;
          do {
            switch (b.tag) {
              case 3:
                b = b.stateNode.context;
                break a;
              case 1:
                if (Zf(b.type)) {
                  b = b.stateNode.__reactInternalMemoizedMergedChildContext;
                  break a;
                }
            }
            b = b.return;
          } while (null !== b);
          throw Error(p(171));
        }
        if (1 === a.tag) {
          var c = a.type;
          if (Zf(c)) return bg(a, c, b);
        }
        return b;
      }
      function el(a, b, c, d, e, f, g, h, k) {
        a = bl(c, d, true, a, e, f, g, h, k);
        a.context = dl(null);
        c = a.current;
        d = R();
        e = yi(c);
        f = mh(d, e);
        f.callback = void 0 !== b && null !== b ? b : null;
        nh(c, f, e);
        a.current.lanes = e;
        Ac(a, e, d);
        Dk(a, d);
        return a;
      }
      function fl(a, b, c, d) {
        var e = b.current, f = R(), g = yi(e);
        c = dl(c);
        null === b.context ? b.context = c : b.pendingContext = c;
        b = mh(f, g);
        b.payload = { element: a };
        d = void 0 === d ? null : d;
        null !== d && (b.callback = d);
        a = nh(e, b, g);
        null !== a && (gi(a, e, g, f), oh(a, e, g));
        return g;
      }
      function gl(a) {
        a = a.current;
        if (!a.child) return null;
        switch (a.child.tag) {
          case 5:
            return a.child.stateNode;
          default:
            return a.child.stateNode;
        }
      }
      function hl(a, b) {
        a = a.memoizedState;
        if (null !== a && null !== a.dehydrated) {
          var c = a.retryLane;
          a.retryLane = 0 !== c && c < b ? c : b;
        }
      }
      function il(a, b) {
        hl(a, b);
        (a = a.alternate) && hl(a, b);
      }
      function jl() {
        return null;
      }
      var kl = "function" === typeof reportError ? reportError : function(a) {
        console.error(a);
      };
      function ll(a) {
        this._internalRoot = a;
      }
      ml.prototype.render = ll.prototype.render = function(a) {
        var b = this._internalRoot;
        if (null === b) throw Error(p(409));
        fl(a, b, null, null);
      };
      ml.prototype.unmount = ll.prototype.unmount = function() {
        var a = this._internalRoot;
        if (null !== a) {
          this._internalRoot = null;
          var b = a.containerInfo;
          Rk(function() {
            fl(null, a, null, null);
          });
          b[uf] = null;
        }
      };
      function ml(a) {
        this._internalRoot = a;
      }
      ml.prototype.unstable_scheduleHydration = function(a) {
        if (a) {
          var b = Hc();
          a = { blockedOn: null, target: a, priority: b };
          for (var c = 0; c < Qc.length && 0 !== b && b < Qc[c].priority; c++) ;
          Qc.splice(c, 0, a);
          0 === c && Vc(a);
        }
      };
      function nl(a) {
        return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType);
      }
      function ol(a) {
        return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType && (8 !== a.nodeType || " react-mount-point-unstable " !== a.nodeValue));
      }
      function pl() {
      }
      function ql(a, b, c, d, e) {
        if (e) {
          if ("function" === typeof d) {
            var f = d;
            d = function() {
              var a2 = gl(g);
              f.call(a2);
            };
          }
          var g = el(b, d, a, 0, null, false, false, "", pl);
          a._reactRootContainer = g;
          a[uf] = g.current;
          sf(8 === a.nodeType ? a.parentNode : a);
          Rk();
          return g;
        }
        for (; e = a.lastChild; ) a.removeChild(e);
        if ("function" === typeof d) {
          var h = d;
          d = function() {
            var a2 = gl(k);
            h.call(a2);
          };
        }
        var k = bl(a, 0, false, null, null, false, false, "", pl);
        a._reactRootContainer = k;
        a[uf] = k.current;
        sf(8 === a.nodeType ? a.parentNode : a);
        Rk(function() {
          fl(b, k, c, d);
        });
        return k;
      }
      function rl(a, b, c, d, e) {
        var f = c._reactRootContainer;
        if (f) {
          var g = f;
          if ("function" === typeof e) {
            var h = e;
            e = function() {
              var a2 = gl(g);
              h.call(a2);
            };
          }
          fl(b, g, a, e);
        } else g = ql(c, b, a, e, d);
        return gl(g);
      }
      Ec = function(a) {
        switch (a.tag) {
          case 3:
            var b = a.stateNode;
            if (b.current.memoizedState.isDehydrated) {
              var c = tc(b.pendingLanes);
              0 !== c && (Cc(b, c | 1), Dk(b, B()), 0 === (K & 6) && (Gj = B() + 500, jg()));
            }
            break;
          case 13:
            Rk(function() {
              var b2 = ih(a, 1);
              if (null !== b2) {
                var c2 = R();
                gi(b2, a, 1, c2);
              }
            }), il(a, 1);
        }
      };
      Fc = function(a) {
        if (13 === a.tag) {
          var b = ih(a, 134217728);
          if (null !== b) {
            var c = R();
            gi(b, a, 134217728, c);
          }
          il(a, 134217728);
        }
      };
      Gc = function(a) {
        if (13 === a.tag) {
          var b = yi(a), c = ih(a, b);
          if (null !== c) {
            var d = R();
            gi(c, a, b, d);
          }
          il(a, b);
        }
      };
      Hc = function() {
        return C;
      };
      Ic = function(a, b) {
        var c = C;
        try {
          return C = a, b();
        } finally {
          C = c;
        }
      };
      yb = function(a, b, c) {
        switch (b) {
          case "input":
            bb(a, c);
            b = c.name;
            if ("radio" === c.type && null != b) {
              for (c = a; c.parentNode; ) c = c.parentNode;
              c = c.querySelectorAll("input[name=" + JSON.stringify("" + b) + '][type="radio"]');
              for (b = 0; b < c.length; b++) {
                var d = c[b];
                if (d !== a && d.form === a.form) {
                  var e = Db(d);
                  if (!e) throw Error(p(90));
                  Wa(d);
                  bb(d, e);
                }
              }
            }
            break;
          case "textarea":
            ib(a, c);
            break;
          case "select":
            b = c.value, null != b && fb(a, !!c.multiple, b, false);
        }
      };
      Gb = Qk;
      Hb = Rk;
      var sl = { usingClientEntryPoint: false, Events: [Cb, ue, Db, Eb, Fb, Qk] };
      var tl = { findFiberByHostInstance: Wc, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" };
      var ul = { bundleType: tl.bundleType, version: tl.version, rendererPackageName: tl.rendererPackageName, rendererConfig: tl.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: ua.ReactCurrentDispatcher, findHostInstanceByFiber: function(a) {
        a = Zb(a);
        return null === a ? null : a.stateNode;
      }, findFiberByHostInstance: tl.findFiberByHostInstance || jl, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
      if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
        vl = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!vl.isDisabled && vl.supportsFiber) try {
          kc = vl.inject(ul), lc = vl;
        } catch (a) {
        }
      }
      var vl;
      exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = sl;
      exports.createPortal = function(a, b) {
        var c = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
        if (!nl(b)) throw Error(p(200));
        return cl(a, b, null, c);
      };
      exports.createRoot = function(a, b) {
        if (!nl(a)) throw Error(p(299));
        var c = false, d = "", e = kl;
        null !== b && void 0 !== b && (true === b.unstable_strictMode && (c = true), void 0 !== b.identifierPrefix && (d = b.identifierPrefix), void 0 !== b.onRecoverableError && (e = b.onRecoverableError));
        b = bl(a, 1, false, null, null, c, false, d, e);
        a[uf] = b.current;
        sf(8 === a.nodeType ? a.parentNode : a);
        return new ll(b);
      };
      exports.findDOMNode = function(a) {
        if (null == a) return null;
        if (1 === a.nodeType) return a;
        var b = a._reactInternals;
        if (void 0 === b) {
          if ("function" === typeof a.render) throw Error(p(188));
          a = Object.keys(a).join(",");
          throw Error(p(268, a));
        }
        a = Zb(b);
        a = null === a ? null : a.stateNode;
        return a;
      };
      exports.flushSync = function(a) {
        return Rk(a);
      };
      exports.hydrate = function(a, b, c) {
        if (!ol(b)) throw Error(p(200));
        return rl(null, a, b, true, c);
      };
      exports.hydrateRoot = function(a, b, c) {
        if (!nl(a)) throw Error(p(405));
        var d = null != c && c.hydratedSources || null, e = false, f = "", g = kl;
        null !== c && void 0 !== c && (true === c.unstable_strictMode && (e = true), void 0 !== c.identifierPrefix && (f = c.identifierPrefix), void 0 !== c.onRecoverableError && (g = c.onRecoverableError));
        b = el(b, null, a, 1, null != c ? c : null, e, false, f, g);
        a[uf] = b.current;
        sf(a);
        if (d) for (a = 0; a < d.length; a++) c = d[a], e = c._getVersion, e = e(c._source), null == b.mutableSourceEagerHydrationData ? b.mutableSourceEagerHydrationData = [c, e] : b.mutableSourceEagerHydrationData.push(
          c,
          e
        );
        return new ml(b);
      };
      exports.render = function(a, b, c) {
        if (!ol(b)) throw Error(p(200));
        return rl(null, a, b, false, c);
      };
      exports.unmountComponentAtNode = function(a) {
        if (!ol(a)) throw Error(p(40));
        return a._reactRootContainer ? (Rk(function() {
          rl(null, null, a, false, function() {
            a._reactRootContainer = null;
            a[uf] = null;
          });
        }), true) : false;
      };
      exports.unstable_batchedUpdates = Qk;
      exports.unstable_renderSubtreeIntoContainer = function(a, b, c, d) {
        if (!ol(c)) throw Error(p(200));
        if (null == a || void 0 === a._reactInternals) throw Error(p(38));
        return rl(a, b, c, false, d);
      };
      exports.version = "18.3.1-next-f1338f8080-20240426";
    }
  });

  // node_modules/react-dom/index.js
  var require_react_dom = __commonJS({
    "node_modules/react-dom/index.js"(exports, module) {
      "use strict";
      function checkDCE() {
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
          return;
        }
        if (false) {
          throw new Error("^_^");
        }
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
        } catch (err) {
          console.error(err);
        }
      }
      if (true) {
        checkDCE();
        module.exports = require_react_dom_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // node_modules/react-dom/client.js
  var require_client = __commonJS({
    "node_modules/react-dom/client.js"(exports) {
      "use strict";
      var m = require_react_dom();
      if (true) {
        exports.createRoot = m.createRoot;
        exports.hydrateRoot = m.hydrateRoot;
      } else {
        i = m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
        exports.createRoot = function(c, o) {
          i.usingClientEntryPoint = true;
          try {
            return m.createRoot(c, o);
          } finally {
            i.usingClientEntryPoint = false;
          }
        };
        exports.hydrateRoot = function(c, h, o) {
          i.usingClientEntryPoint = true;
          try {
            return m.hydrateRoot(c, h, o);
          } finally {
            i.usingClientEntryPoint = false;
          }
        };
      }
      var i;
    }
  });

  // node_modules/react/cjs/react-jsx-runtime.production.min.js
  var require_react_jsx_runtime_production_min = __commonJS({
    "node_modules/react/cjs/react-jsx-runtime.production.min.js"(exports) {
      "use strict";
      var f = require_react();
      var k = Symbol.for("react.element");
      var l = Symbol.for("react.fragment");
      var m = Object.prototype.hasOwnProperty;
      var n = f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner;
      var p = { key: true, ref: true, __self: true, __source: true };
      function q(c, a, g) {
        var b, d = {}, e = null, h = null;
        void 0 !== g && (e = "" + g);
        void 0 !== a.key && (e = "" + a.key);
        void 0 !== a.ref && (h = a.ref);
        for (b in a) m.call(a, b) && !p.hasOwnProperty(b) && (d[b] = a[b]);
        if (c && c.defaultProps) for (b in a = c.defaultProps, a) void 0 === d[b] && (d[b] = a[b]);
        return { $$typeof: k, type: c, key: e, ref: h, props: d, _owner: n.current };
      }
      exports.Fragment = l;
      exports.jsx = q;
      exports.jsxs = q;
    }
  });

  // node_modules/react/jsx-runtime.js
  var require_jsx_runtime = __commonJS({
    "node_modules/react/jsx-runtime.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_react_jsx_runtime_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // src/ui/main.jsx
  var import_react2 = __toESM(require_react(), 1);
  var import_client = __toESM(require_client(), 1);

  // src/ui/Controls.jsx
  var import_react = __toESM(require_react(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  function Slider({ def, value, onChange }) {
    const v = typeof value === "number" ? value : def.def;
    const fill = (v - def.min) / (def.max - def.min || 1) * 100;
    const step = def.step || 0.01;
    const decimals = step >= 1 ? 0 : String(step).split(".")[1]?.length || 0;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "field-label", children: def.label }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "slider-pill", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "range",
            min: def.min,
            max: def.max,
            step,
            value: v,
            style: { "--fill": `${fill}%` },
            onChange: (e) => onChange(Number(e.target.value))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "num",
            type: "number",
            min: def.min,
            max: def.max,
            step,
            value: Number(v.toFixed(decimals)),
            onChange: (e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.min(def.max, Math.max(def.min, n)));
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "unit", children: def.unit || "" })
      ] })
    ] });
  }
  function Select({ label, value, options, onChange, grouped }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "field", children: [
      label && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "field-label", children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { value: String(value), onChange: (e) => onChange(e.target.value), children: grouped ? grouped.map(([group, items]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("optgroup", { label: group, children: items.map(([v, l]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: v, children: l }, v)) }, group)) : options.map(([v, l]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: v, children: l }, v)) })
    ] });
  }
  function Toggle({ label, checked, onChange }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "switch-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: `toggle ${checked ? "on" : ""}`, "aria-pressed": checked, onClick: () => onChange(!checked), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "knob" }) })
    ] });
  }
  function ParamForm({ schema, values, onChange }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "param-form", children: schema.map((def) => {
      const v = values[def.key] ?? def.def;
      if (def.type === "enum") {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Select,
          {
            label: def.label,
            value: v,
            options: def.options,
            onChange: (x) => onChange(def.key, x)
          },
          def.key
        );
      }
      if (def.type === "bool") {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { label: def.label, checked: !!v, onChange: (x) => onChange(def.key, x) }, def.key);
      }
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, { def, value: v, onChange: (x) => onChange(def.key, x) }, def.key);
    }) });
  }
  function Card({ title, caption, children, note, className = "" }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: `pcard ${className}`, children: [
      caption && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "section-caption", children: caption }),
      title && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "card-title", children: title }),
      note && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "card-note", children: note }),
      children
    ] });
  }

  // src/engine/rng.js
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // src/engine/noise.js
  function fbm(n, x, y, octaves, lacunarity, gain) {
    let a = 1;
    let f = 1;
    let s = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      s += a * n(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return norm > 0 ? s / norm : 0;
  }
  function ridged(n, x, y, octaves, lacunarity, gain, sharpness) {
    let a = 1;
    let f = 1;
    let s = 0;
    let norm = 0;
    let w = 1;
    for (let i = 0; i < octaves; i++) {
      let sig = Math.pow(1 - Math.abs(n(x * f, y * f)), sharpness);
      sig *= w;
      w = Math.min(1, Math.max(0, sig * gain));
      s += sig * a;
      norm += a;
      a *= 0.5;
      f *= lacunarity;
    }
    return norm > 0 ? s / norm : 0;
  }
  function hybrid(n, x, y, octaves, lacunarity, H, offset) {
    let f = 1;
    let pw = 1;
    let result = 0;
    let weight = 1;
    const step = Math.pow(lacunarity, -H);
    for (let i = 0; i < octaves; i++) {
      const sig = (n(x * f, y * f) + offset) * pw;
      if (i === 0) {
        result = sig;
        weight = sig;
      } else {
        if (weight > 1) weight = 1;
        result += weight * sig;
        weight *= sig;
      }
      f *= lacunarity;
      pw *= step;
    }
    return result;
  }
  function billow(n, x, y, octaves, lacunarity, gain) {
    let a = 1;
    let f = 1;
    let s = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      s += a * Math.abs(n(x * f, y * f));
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return norm > 0 ? s / norm : 0;
  }

  // src/engine/field.js
  var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  var lerp = (a, b, t) => a + (b - a) * t;
  function smoothstep(a, b, x) {
    if (a === b) return x < a ? 0 : 1;
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function smootherstep(a, b, x) {
    if (a === b) return x < a ? 0 : 1;
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function minMax(f) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < f.length; i++) {
      const v = f[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }
  function normalize(f) {
    const [lo, hi] = minMax(f);
    const s = hi - lo > 1e-12 ? 1 / (hi - lo) : 0;
    for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * s;
    return f;
  }
  function boxBlur(src, N, r) {
    if (r < 1) return Float32Array.from(src);
    const tmp = new Float32Array(N * N);
    const out = new Float32Array(N * N);
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < N; y++) {
      let acc = 0;
      const row = y * N;
      for (let k = -r; k <= r; k++) acc += src[row + clamp(k, 0, N - 1)];
      for (let x = 0; x < N; x++) {
        tmp[row + x] = acc * inv;
        acc += src[row + clamp(x + r + 1, 0, N - 1)] - src[row + clamp(x - r, 0, N - 1)];
      }
    }
    for (let x = 0; x < N; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[clamp(k, 0, N - 1) * N + x];
      for (let y = 0; y < N; y++) {
        out[y * N + x] = acc * inv;
        acc += tmp[clamp(y + r + 1, 0, N - 1) * N + x] - tmp[clamp(y - r, 0, N - 1) * N + x];
      }
    }
    return out;
  }
  function gaussianBlur(src, N, r) {
    const rr = Math.max(1, Math.round(r));
    return boxBlur(boxBlur(boxBlur(src, N, rr), N, rr), N, rr);
  }
  function gradient(Hm, N, cell) {
    const gx = new Float32Array(N * N);
    const gy = new Float32Array(N * N);
    const k = 1 / (2 * cell);
    for (let y = 0; y < N; y++) {
      const ym = clamp(y - 1, 0, N - 1) * N;
      const yp = clamp(y + 1, 0, N - 1) * N;
      const row = y * N;
      for (let x = 0; x < N; x++) {
        const xm = clamp(x - 1, 0, N - 1);
        const xp = clamp(x + 1, 0, N - 1);
        gx[row + x] = (Hm[row + xp] - Hm[row + xm]) * k;
        gy[row + x] = (Hm[yp + x] - Hm[ym + x]) * k;
      }
    }
    return { gx, gy };
  }
  function slopeDegrees(gx, gy) {
    const out = new Float32Array(gx.length);
    for (let i = 0; i < gx.length; i++) out[i] = Math.atan(Math.hypot(gx[i], gy[i])) * 180 / Math.PI;
    return out;
  }
  function laplacian(Hm, N) {
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      const ym = clamp(y - 1, 0, N - 1) * N;
      const yp = clamp(y + 1, 0, N - 1) * N;
      const row = y * N;
      for (let x = 0; x < N; x++) {
        const xm = clamp(x - 1, 0, N - 1);
        const xp = clamp(x + 1, 0, N - 1);
        out[row + x] = Hm[row + xm] + Hm[row + xp] + Hm[ym + x] + Hm[yp + x] - 4 * Hm[row + x];
      }
    }
    return out;
  }
  function distanceFrom(source, N) {
    const INF = 1e9;
    const d = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) d[i] = source[i] ? 0 : INF;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) {
          v = Math.min(v, d[i - N] + 1);
          if (x > 0) v = Math.min(v, d[i - N - 1] + 1.4142);
          if (x < N - 1) v = Math.min(v, d[i - N + 1] + 1.4142);
        }
        d[i] = v;
      }
    }
    for (let y = N - 1; y >= 0; y--) {
      for (let x = N - 1; x >= 0; x--) {
        const i = y * N + x;
        let v = d[i];
        if (x < N - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < N - 1) {
          v = Math.min(v, d[i + N] + 1);
          if (x < N - 1) v = Math.min(v, d[i + N + 1] + 1.4142);
          if (x > 0) v = Math.min(v, d[i + N - 1] + 1.4142);
        }
        d[i] = v;
      }
    }
    return d;
  }
  function fillDepressions(Hm, N, eps) {
    const F = Float32Array.from(Hm);
    const done = new Uint8Array(N * N);
    const cap = N * N + 4;
    const keys = new Float64Array(cap);
    const ids = new Int32Array(cap);
    let size = 0;
    const push = (k, id) => {
      let i = size++;
      while (i > 0) {
        const p = i - 1 >> 1;
        if (keys[p] <= k) break;
        keys[i] = keys[p];
        ids[i] = ids[p];
        i = p;
      }
      keys[i] = k;
      ids[i] = id;
    };
    const pop = () => {
      const topId = ids[0];
      const lastK = keys[--size];
      const lastI = ids[size];
      let i = 0;
      for (; ; ) {
        let c = i * 2 + 1;
        if (c >= size) break;
        if (c + 1 < size && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastK) break;
        keys[i] = keys[c];
        ids[i] = ids[c];
        i = c;
      }
      keys[i] = lastK;
      ids[i] = lastI;
      return topId;
    };
    for (let x = 0; x < N; x++) {
      for (const i of [x, (N - 1) * N + x]) {
        if (!done[i]) {
          done[i] = 1;
          push(F[i], i);
        }
      }
    }
    for (let y = 0; y < N; y++) {
      for (const i of [y * N, y * N + N - 1]) {
        if (!done[i]) {
          done[i] = 1;
          push(F[i], i);
        }
      }
    }
    while (size > 0) {
      const i = pop();
      const x = i % N;
      const y = (i - x) / N;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const j = ny * N + nx;
          if (done[j]) continue;
          done[j] = 1;
          if (F[j] <= F[i]) F[j] = F[i] + eps;
          push(F[j], j);
        }
      }
    }
    return F;
  }
  var D8 = [
    [-1, -1, 1.4142],
    [0, -1, 1],
    [1, -1, 1.4142],
    [-1, 0, 1],
    [1, 0, 1],
    [-1, 1, 1.4142],
    [0, 1, 1],
    [1, 1, 1.4142]
  ];
  function routeFlow(Hm, N, cell) {
    const F = fillDepressions(Hm, N, 1e-3);
    const receiver = new Int32Array(N * N).fill(-1);
    const slopeTo = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        let best = 0;
        let bestJ = -1;
        for (const [dx, dy, w] of D8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const j = ny * N + nx;
          const s = (F[i] - F[j]) / (w * cell);
          if (s > best) {
            best = s;
            bestJ = j;
          }
        }
        receiver[i] = bestJ;
        slopeTo[i] = best;
      }
    }
    const order = new Uint32Array(N * N);
    for (let i = 0; i < order.length; i++) order[i] = i;
    order.sort((a, b) => F[b] - F[a]);
    return { receiver, slopeTo, order, filled: F };
  }
  function accumulate(receiver, order, weight) {
    const A = weight ? Float32Array.from(weight) : new Float32Array(receiver.length).fill(1);
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const r = receiver[i];
      if (r >= 0) A[r] += A[i];
    }
    return A;
  }

  // src/engine/schema.js
  var num = (key, label, min, max, step, def, unit = "") => ({ key, label, type: "num", min, max, step, def, unit });
  var int = (key, label, min, max, def, unit = "") => ({ key, label, type: "int", min, max, step: 1, def, unit });
  var choice = (key, label, options, def) => ({ key, label, type: "enum", options, def });
  function defaultsOf(list) {
    const out = {};
    for (const p of list) out[p.key] = p.def;
    return out;
  }
  var GENERATOR_COMMON = [
    num("amplitude", "Amplitude", 0, 1, 0.01, 1, "\xD7"),
    num("base", "Base level", 0, 1, 0.01, 0, "\xD7"),
    int("seed", "Seed offset", 0, 999, 0)
  ];

  // src/engine/generators.js
  function sampleField(c, fn) {
    const { N } = c;
    const out = new Float32Array(N * N);
    const inv = 1 / N;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) out[y * N + x] = fn(x * inv, y * inv);
    }
    return out;
  }
  function finish(out, p) {
    normalize(out);
    for (let i = 0; i < out.length; i++) out[i] = clamp(p.base + p.amplitude * out[i], 0, 1);
    return out;
  }
  var SHARED = {
    frequency: num("frequency", "Frequency", 0.2, 12, 0.05, 2, "cycles"),
    octaves: int("octaves", "Octaves", 1, 12, 6),
    lacunarity: num("lacunarity", "Lacunarity", 1.2, 3.5, 0.05, 2),
    gain: num("gain", "Gain (persistence)", 0.1, 0.9, 0.01, 0.5),
    warp: num("warp", "Domain warp", 0, 1, 0.01, 0.3, "\xD7")
  };
  function warped(n, u, v, amount) {
    if (amount <= 0) return [u, v];
    const wx = fbm(n.perlin, u + 5.2, v + 1.3, 3, 2, 0.5);
    const wy = fbm(n.perlin, u + 8.3, v + 2.8, 3, 2, 0.5);
    return [u + amount * wx * 0.6, v + amount * wy * 0.6];
  }
  var GENERATORS = {
    perlin: {
      label: "Perlin fBm",
      category: "generator",
      blurb: "Rolling, soft relief. The workhorse for foothills, plains and dune fields.",
      params: [SHARED.frequency, SHARED.octaves, SHARED.lacunarity, SHARED.gain, SHARED.warp, ...GENERATOR_COMMON],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        const sc = p.frequency;
        return finish(
          sampleField(c, (u, v) => {
            const [a, b] = warped(n, u * sc, v * sc, p.warp);
            return fbm(n.perlin, a, b, p.octaves, p.lacunarity, p.gain);
          }),
          p
        );
      }
    },
    multifractal: {
      label: "Multifractal (hybrid)",
      category: "generator",
      blurb: "Musgrave hybrid multifractal. Rough, uneven ground that gets busier with height, like weathered massifs.",
      params: [
        num("frequency", "Frequency", 0.2, 10, 0.05, 2, "cycles"),
        int("octaves", "Octaves", 1, 12, 8),
        num("roughness", "Roughness (H)", 0.1, 1.5, 0.01, 0.8),
        num("offset", "Offset", 0.5, 1.5, 0.01, 0.9),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        return finish(
          sampleField(c, (u, v) => {
            const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp);
            return hybrid(n.perlin, a, b, p.octaves, 2, p.roughness, p.offset);
          }),
          p
        );
      }
    },
    ridged: {
      label: "Ridged multifractal",
      category: "generator",
      blurb: "Sharp crests and valleys. Pure ridge structure for spines and folded sierras.",
      params: [
        num("frequency", "Frequency", 0.2, 10, 0.05, 2.5, "cycles"),
        int("octaves", "Octaves", 1, 10, 6),
        num("sharpness", "Crest sharpness", 0.5, 3, 0.05, 1.2),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        return finish(
          sampleField(c, (u, v) => {
            const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp);
            return ridged(n.perlin, a, b, p.octaves, 2, 2, p.sharpness);
          }),
          p
        );
      }
    },
    mountain: {
      label: "Mountain range",
      category: "generator",
      blurb: "Ridged crests grouped into ranges. Coverage decides how much of the map is mountain at all.",
      params: [
        num("frequency", "Range scale", 0.5, 6, 0.05, 1.6, "cycles"),
        int("octaves", "Detail octaves", 1, 10, 7),
        num("sharpness", "Crest sharpness", 0.5, 3, 0.05, 1.7),
        num("coverage", "Range coverage", 0, 1, 0.01, 0.55, "\xD7"),
        num("peaks", "Peak exponent", 0.5, 3, 0.05, 1.4),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        const { coverage, peaks } = p;
        const ridgeField = sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * p.frequency * 1.6, v * p.frequency * 1.6, Math.max(p.warp, 0.6));
          return ridged(n.perlin, a, b, p.octaves, 2.1, 2, p.sharpness);
        });
        const cover = sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * p.frequency * 0.5 + 9.1, v * p.frequency * 0.5 + 3.7, 0.5);
          return billow(n.perlin, a, b, 3, 2, 0.5);
        });
        normalize(cover);
        const out = new Float32Array(ridgeField.length);
        for (let i = 0; i < out.length; i++) {
          const mask = smoothstep(coverage - 0.25, coverage + 0.25, cover[i]);
          out[i] = Math.pow(ridgeField[i], peaks) * mask + 0.08 * mask * cover[i];
        }
        return finish(out, p);
      }
    },
    billow: {
      label: "Billow noise",
      category: "generator",
      blurb: "Absolute-value noise. Soft bulbous mounds, good for dunes and rounded hills.",
      params: [
        num("frequency", "Frequency", 0.2, 12, 0.05, 3, "cycles"),
        int("octaves", "Octaves", 1, 10, 5),
        num("gain", "Gain (persistence)", 0.1, 0.9, 0.01, 0.5),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        return finish(
          sampleField(c, (u, v) => {
            const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp);
            return billow(n.perlin, a, b, p.octaves, 2, p.gain);
          }),
          p
        );
      }
    },
    voronoi: {
      label: "Voronoi terraces",
      category: "generator",
      blurb: "Cellular plates. With terrace steps it reads as lava plateaux, mesa caps and tilted fault blocks.",
      params: [
        num("frequency", "Cell count", 1, 16, 0.1, 4, "cells"),
        num("jitter", "Jitter", 0, 1, 0.01, 0.9),
        int("steps", "Terrace steps (0 = smooth)", 0, 16, 5),
        num("edge", "Edge softness", 0, 1, 0.01, 0.35),
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        const out = sampleField(c, (u, v) => {
          const d = n.cellular(u * p.frequency, v * p.frequency, p.jitter);
          return 1 - clamp(d, 0, 1);
        });
        normalize(out);
        if (p.steps > 0) {
          const soft = p.edge;
          for (let i = 0; i < out.length; i++) {
            const t = out[i] * p.steps;
            const f = Math.floor(t);
            const r = t - f;
            const s = smoothstep(0.5 - soft * 0.5, 0.5 + soft * 0.5, r);
            out[i] = (f + s) / p.steps;
          }
        }
        return finish(out, p);
      }
    },
    island: {
      label: "Island / continent",
      category: "generator",
      blurb: "A landmass inside a basin. Radius and falloff set how much sea surrounds the coast.",
      params: [
        num("radius", "Land radius", 0.1, 0.7, 0.01, 0.4, "\xD7"),
        num("falloff", "Coast falloff", 0.02, 0.6, 0.01, 0.22, "\xD7"),
        num("frequency", "Coastline detail", 0.5, 8, 0.05, 2.4, "cycles"),
        int("octaves", "Octaves", 1, 10, 7),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        const out = sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp + 0.2);
          const detail = fbm(n.perlin, a, b, p.octaves, 2, 0.5) * 0.5 + 0.5;
          const dx = (u - 0.5) * 2;
          const dy = (v - 0.5) * 2;
          const r = Math.hypot(dx, dy) / Math.SQRT2;
          const coast = p.radius + (detail - 0.5) * 0.35;
          const land = 1 - smoothstep(coast - p.falloff, coast + p.falloff, r);
          return land * (0.45 + 0.55 * detail);
        });
        return finish(out, p);
      }
    },
    flat: {
      label: "Flat plateau",
      category: "generator",
      blurb: "Constant height. Start here when a later layer should do all the shaping.",
      params: [num("level", "Level", 0, 1, 0.01, 0.3, "\xD7"), int("seed", "Seed offset", 0, 999, 0)],
      run(c, p) {
        return new Float32Array(c.N * c.N).fill(clamp(p.level, 0, 1));
      }
    }
  };
  function runGenerator(name, c, overrides) {
    const g = GENERATORS[name] || GENERATORS.perlin;
    const p = { ...defaultsOf(g.params), ...overrides };
    return g.run(c, p);
  }

  // src/engine/erosion.js
  function hydraulic(c, H, p) {
    const { N } = c;
    const sed = new Float32Array(N * N);
    const rnd = mulberry32(c.seed + 101);
    const count = Math.round(p.density * N * N);
    const r = Math.max(1, Math.round(p.radius));
    const bx = [];
    const by = [];
    const bw = [];
    let wsum = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d >= r) continue;
        const w = r - d;
        bx.push(dx);
        by.push(dy);
        bw.push(w);
        wsum += w;
      }
    }
    for (let k = 0; k < bw.length; k++) bw[k] /= wsum;
    const { inertia, capacity, erosionRate, depositRate, evaporation, gravity, minSlope } = p;
    const maxLife = p.lifetime | 0;
    for (let d = 0; d < count; d++) {
      let x = 1 + rnd() * (N - 3);
      let y = 1 + rnd() * (N - 3);
      let dx = 0;
      let dy = 0;
      let speed = 1;
      let water = 1;
      let s = 0;
      for (let life = 0; life < maxLife; life++) {
        const xi = x | 0;
        const yi = y | 0;
        const fx = x - xi;
        const fy = y - yi;
        const i = yi * N + xi;
        const h00 = H[i];
        const h10 = H[i + 1];
        const h01 = H[i + N];
        const h11 = H[i + N + 1];
        const gxv = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
        const gyv = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
        const hOld = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
        dx = dx * inertia - gxv * (1 - inertia);
        dy = dy * inertia - gyv * (1 - inertia);
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) {
          const a = rnd() * Math.PI * 2;
          dx = Math.cos(a);
          dy = Math.sin(a);
        } else {
          dx /= len;
          dy /= len;
        }
        x += dx;
        y += dy;
        if (x < 1 || y < 1 || x >= N - 2 || y >= N - 2) break;
        const nx = x | 0;
        const ny = y | 0;
        const nfx = x - nx;
        const nfy = y - ny;
        const j = ny * N + nx;
        const hNew = H[j] * (1 - nfx) * (1 - nfy) + H[j + 1] * nfx * (1 - nfy) + H[j + N] * (1 - nfx) * nfy + H[j + N + 1] * nfx * nfy;
        const dh = hNew - hOld;
        const cap = Math.max(-dh, minSlope) * speed * water * capacity;
        if (s > cap || dh > 0) {
          const amt = dh > 0 ? Math.min(dh, s) : (s - cap) * depositRate;
          s -= amt;
          H[i] += amt * (1 - fx) * (1 - fy);
          H[i + 1] += amt * fx * (1 - fy);
          H[i + N] += amt * (1 - fx) * fy;
          H[i + N + 1] += amt * fx * fy;
          sed[i] += amt * (1 - fx) * (1 - fy);
          sed[i + 1] += amt * fx * (1 - fy);
          sed[i + N] += amt * (1 - fx) * fy;
          sed[i + N + 1] += amt * fx * fy;
        } else {
          const amt = Math.min((cap - s) * erosionRate, -dh);
          s += amt;
          for (let k = 0; k < bw.length; k++) {
            const tx = xi + bx[k];
            const ty = yi + by[k];
            if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
            H[ty * N + tx] -= amt * bw[k];
          }
        }
        speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity));
        water *= 1 - evaporation;
      }
    }
    return sed;
  }
  function thermal(c, H, p) {
    const { N, cell } = c;
    const sed = new Float32Array(N * N);
    const tan = Math.tan(p.talus * Math.PI / 180);
    const diag = cell * Math.SQRT2;
    const D = [
      [-1, -1, diag],
      [0, -1, cell],
      [1, -1, diag],
      [-1, 0, cell],
      [1, 0, cell],
      [-1, 1, diag],
      [0, 1, cell],
      [1, 1, diag]
    ];
    const delta = new Float32Array(N * N);
    const exc_ = new Float64Array(8);
    for (let it = 0; it < p.iterations; it++) {
      delta.fill(0);
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = y * N + x;
          const h = H[i];
          let total = 0;
          let maxExc = 0;
          for (let k = 0; k < 8; k++) {
            const [dx, dy, dist] = D[k];
            const exc = h - H[(y + dy) * N + x + dx] - tan * dist;
            exc_[k] = exc > 0 ? exc : 0;
            total += exc_[k];
            if (exc_[k] > maxExc) maxExc = exc_[k];
          }
          if (total <= 0) continue;
          const scale = Math.min(1, 0.5 * maxExc / total) * p.rate;
          for (let k = 0; k < 8; k++) {
            if (exc_[k] <= 0) continue;
            const [dx, dy] = D[k];
            const j = (y + dy) * N + x + dx;
            const move = exc_[k] * scale;
            delta[i] -= move;
            delta[j] += move;
            sed[j] += move;
          }
        }
      }
      for (let i = 0; i < N * N; i++) H[i] += delta[i];
    }
    return sed;
  }
  function stream(c, H, p) {
    const { N, cell } = c;
    const sed = new Float32Array(N * N);
    const K = p.erodibility;
    const next = new Float32Array(N * N);
    for (let it = 0; it < p.iterations; it++) {
      const { receiver, slopeTo, order } = routeFlow(H, N, cell);
      const A = accumulate(receiver, order, null);
      const flux = new Float32Array(N * N);
      next.set(H);
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const r = receiver[i];
        const S = Math.max(0, slopeTo[i]);
        let ero = K * Math.pow(A[i], p.areaExp) * Math.pow(S, p.slopeExp);
        ero = Math.min(ero, p.maxStep);
        next[i] -= ero;
        flux[i] += ero;
        if (S < p.depositSlope) {
          const dep = Math.min(flux[i] * p.depositFraction, p.maxDeposit);
          next[i] += dep;
          sed[i] += dep;
          flux[i] -= dep;
        }
        if (r >= 0) flux[r] += flux[i];
      }
      for (let i = 0; i < N * N; i++) {
        H[i] = Math.max(0, next[i] + p.uplift);
      }
    }
    return sed;
  }
  function aeolian(c, H, p) {
    const { N, cell } = c;
    const sed = new Float32Array(N * N);
    const th = p.direction * Math.PI / 180;
    const wx = Math.cos(th);
    const wy = Math.sin(th);
    const hop = p.saltation;
    const F = new Float32Array(N * N);
    const F2 = new Float32Array(N * N);
    const sampleH = (x, y) => {
      const xc = clamp(x, 0, N - 1.001);
      const yc = clamp(y, 0, N - 1.001);
      const x0 = xc | 0;
      const y0 = yc | 0;
      const fx = xc - x0;
      const fy = yc - y0;
      const i = y0 * N + x0;
      return H[i] * (1 - fx) * (1 - fy) + H[i + 1] * fx * (1 - fy) + H[i + N] * (1 - fx) * fy + H[i + N + 1] * fx * fy;
    };
    const sampleF = (x, y) => {
      const xc = clamp(x, 0, N - 1.001);
      const yc = clamp(y, 0, N - 1.001);
      const x0 = xc | 0;
      const y0 = yc | 0;
      const fx = xc - x0;
      const fy = yc - y0;
      const i = y0 * N + x0;
      return F[i] * (1 - fx) * (1 - fy) + F[i + 1] * fx * (1 - fy) + F[i + N] * (1 - fx) * fy + F[i + N + 1] * fx * fy;
    };
    const pickBase = p.strength * 0.6;
    const capBase = p.strength * 0.5;
    for (let it = 0; it < p.iterations; it++) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          const s = (sampleH(x + wx, y + wy) - sampleH(x - wx, y - wy)) / (2 * cell);
          const load = Math.min(1, F[i] / (capBase + 1e-6));
          const pick = pickBase * Math.max(0, s) * (1 - load);
          H[i] -= pick;
          F[i] += pick;
        }
      }
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) F2[y * N + x] = sampleF(x - wx * hop, y - wy * hop);
      }
      F.set(F2);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          const s = (sampleH(x + wx, y + wy) - sampleH(x - wx, y - wy)) / (2 * cell);
          const cap = capBase * clamp(1 + 6 * s, 0.05, 3);
          if (F[i] > cap) {
            const dep = (F[i] - cap) * 0.5;
            F[i] -= dep;
            H[i] += dep;
            sed[i] += dep;
          }
        }
      }
    }
    return sed;
  }
  function glacial(c, H, p) {
    const { N, cell } = c;
    const sed = new Float32Array(N * N);
    const next = new Float32Array(N * N);
    for (let it = 0; it < p.iterations; it++) {
      const { receiver, slopeTo, order } = routeFlow(H, N, cell);
      const A = accumulate(receiver, order, null);
      const lap = laplacian(H, N);
      const ice = new Float32Array(N * N);
      const maxH = c.maxH;
      const line = p.iceline * maxH;
      for (let i = 0; i < N * N; i++) ice[i] = smoothstep(line - 0.04 * maxH, line + 0.04 * maxH, H[i]);
      next.set(H);
      for (let i = 0; i < N * N; i++) {
        const g = ice[i];
        if (g <= 0) continue;
        const S = Math.max(0, slopeTo[i]);
        const valley = smoothstep(4, 60, A[i]);
        next[i] += p.smoothing * 0.18 * g * valley * lap[i];
        next[i] -= p.cirque * 0.12 * g * Math.max(0, lap[i]);
        next[i] -= Math.min(p.intensity * 0.08 * Math.sqrt(A[i]) * Math.pow(S, 0.9) * g, 25);
      }
      for (let i = 0; i < N * N; i++) {
        const before = H[i];
        H[i] = Math.max(0, next[i]);
        if (H[i] < before) sed[i] += Math.min(25, (before - H[i]) * (1 - ice[i]) * 0.3);
      }
    }
    return sed;
  }
  var EROSIONS = {
    hydraulic: {
      label: "Hydraulic (rain)",
      category: "erosion",
      blurb: "Rain droplets carve gullies and deposit fans. Realistic dendritic drainage and sediment aprons.",
      params: [
        num("density", "Droplets per cell", 0.1, 4, 0.05, 1.2, "\xD7"),
        int("lifetime", "Droplet lifetime", 10, 150, 60, "steps"),
        num("inertia", "Inertia", 0, 0.5, 0.01, 0.05),
        num("capacity", "Sediment capacity", 0.5, 12, 0.1, 4),
        num("erosionRate", "Erosion rate", 0.01, 1, 0.01, 0.3),
        num("depositRate", "Deposition rate", 0, 1, 0.01, 0.3),
        num("evaporation", "Evaporation", 0, 0.1, 1e-3, 0.02),
        num("gravity", "Gravity", 1, 20, 0.1, 10),
        num("minSlope", "Minimum slope", 0, 0.5, 0.01, 0.05),
        num("radius", "Brush radius", 1, 6, 0.1, 2, "cells")
      ],
      run: (c, H, p) => hydraulic(c, H, p)
    },
    thermal: {
      label: "Thermal (talus)",
      category: "erosion",
      blurb: "Rock fall and scree. Slopes relax to their angle of repose, so cliffs get aprons of debris.",
      params: [
        num("talus", "Talus angle", 15, 70, 0.5, 35, "\xB0"),
        int("iterations", "Iterations", 1, 200, 25),
        num("rate", "Transfer rate", 0.05, 0.5, 0.01, 0.4)
      ],
      run: (c, H, p) => thermal(c, H, p)
    },
    stream: {
      label: "Stream power (fluvial)",
      category: "erosion",
      blurb: "Rivers incise according to drainage area and gradient. Canyons and valleys with knickpoints.",
      params: [
        int("iterations", "Iterations", 1, 40, 8),
        num("erodibility", "Erodibility (K)", 1e-3, 0.2, 1e-3, 0.02),
        num("areaExp", "Area exponent (m)", 0.2, 0.9, 0.01, 0.5),
        num("slopeExp", "Slope exponent (n)", 0.5, 2, 0.01, 1),
        num("uplift", "Uplift per step", 0, 20, 0.1, 0, "m"),
        num("maxStep", "Max cut per step", 1, 60, 0.5, 20, "m"),
        num("depositSlope", "Deposit below slope", 0, 0.1, 1e-3, 0.02),
        num("depositFraction", "Deposit fraction", 0, 1, 0.01, 0.5),
        num("maxDeposit", "Max deposit per step", 0, 40, 0.1, 4, "m")
      ],
      run: (c, H, p) => stream(c, H, p)
    },
    aeolian: {
      label: "Aeolian (wind & dunes)",
      category: "erosion",
      blurb: "Wind deflates windward faces and builds dunes and sand sheets on the lee. Use with desert presets.",
      params: [
        num("direction", "Wind direction", 0, 360, 1, 225, "\xB0"),
        num("strength", "Wind strength", 0, 1, 0.01, 0.6),
        num("saltation", "Saltation hop", 1, 20, 0.1, 6, "cells"),
        int("iterations", "Iterations", 1, 400, 90)
      ],
      run: (c, H, p) => aeolian(c, H, p)
    },
    glacial: {
      label: "Glacial (U-valley)",
      category: "erosion",
      blurb: "Ice carves cirques and U-shaped valleys above the firn line. Alpine character.",
      params: [
        num("iceline", "Ice line", 0.2, 1, 0.01, 0.55, "\xD7"),
        num("intensity", "Plucking intensity", 0, 2, 0.01, 0.6),
        num("smoothing", "Valley widening", 0, 1, 0.01, 0.5),
        num("cirque", "Cirque depth", 0, 1, 0.01, 0.4),
        int("iterations", "Iterations", 1, 30, 6)
      ],
      run: (c, H, p) => glacial(c, H, p)
    }
  };

  // src/engine/modifiers.js
  var MODIFIERS = {
    terrace: {
      label: "Terrace / strata",
      category: "modifier",
      blurb: "Quantises height into benches. Smooth = 0 gives hard steps, 1 gives soft rounded shelves.",
      params: [
        int("steps", "Steps", 2, 40, 8),
        num("smooth", "Edge softness", 0, 1, 0.01, 0.3)
      ],
      run(c, H, p) {
        const out = new Float32Array(H.length);
        const half = (1 - p.smooth) * 0.5 + 0.02;
        for (let i = 0; i < H.length; i++) {
          const t = H[i] * p.steps;
          const f = Math.floor(t);
          const r = t - f;
          const s = smoothstep(0.5 - half, 0.5 + half, r);
          out[i] = clamp((f + s) / p.steps, 0, 1);
        }
        return out;
      }
    },
    rift: {
      label: "Rift carve",
      category: "modifier",
      blurb: "Cuts a fault-line graben with a flat floor. The walls are as steep as Wall sharpness asks.",
      params: [
        num("depth", "Depth", 0, 800, 5, 220, "m"),
        num("frequency", "Fault frequency", 0.5, 8, 0.05, 2, "cycles"),
        num("width", "Rift width", 0.01, 0.3, 5e-3, 0.06),
        num("wall", "Wall sharpness", 0, 1, 0.01, 0.6),
        num("warp", "Fault warp", 0, 1, 0.01, 0.5, "\xD7"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, H, p) {
        const { N, maxH } = c;
        const n = c.noiseFor(p.seed + 97);
        const out = new Float32Array(H.length);
        const depthN = p.depth / maxH;
        const wall = 1 + p.wall * 3;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const u = x / N;
            const v = y / N;
            const wx = fbm(n.perlin, u * 2 + 4.1, v * 2 + 0.7, 3, 2, 0.5) * p.warp;
            const wy = fbm(n.perlin, u * 2 + 9.3, v * 2 + 6.2, 3, 2, 0.5) * p.warp;
            const z = Math.abs(n.perlin((u + wx * 0.5) * p.frequency, (v + wy * 0.5) * p.frequency));
            const inside = 1 - smoothstep(0, p.width * 3, z);
            const i = y * N + x;
            out[i] = clamp(H[i] - depthN * Math.pow(inside, wall) * (1 - 0.15 * (1 - inside)), 0, 1);
          }
        }
        return out;
      }
    },
    smooth: {
      label: "Smooth",
      category: "modifier",
      blurb: "Gaussian relaxation. Calms harsh noise and keeps large forms, as a geologist would after weathering.",
      params: [
        int("radius", "Radius", 1, 20, 3, "cells"),
        num("detail", "Detail kept", 0, 1, 0.01, 0.4)
      ],
      run(c, H, p) {
        const blur = gaussianBlur(H, c.N, p.radius);
        const out = new Float32Array(H.length);
        for (let i = 0; i < H.length; i++) out[i] = blur[i] + (H[i] - blur[i]) * p.detail;
        return out;
      }
    },
    sharpen: {
      label: "Sharpen ridges",
      category: "modifier",
      blurb: "Unsharp mask on height. Pushes crests and spurs up and cuts valleys deeper for rugged outcrops.",
      params: [
        num("amount", "Amount", 0, 3, 0.01, 0.8),
        int("radius", "Radius", 2, 20, 6, "cells")
      ],
      run(c, H, p) {
        const blur = gaussianBlur(H, c.N, p.radius);
        const out = new Float32Array(H.length);
        for (let i = 0; i < H.length; i++) out[i] = clamp(H[i] + p.amount * (H[i] - blur[i]), 0, 1);
        return out;
      }
    },
    cliffSculpt: {
      label: "Cliff sculpt",
      category: "modifier",
      blurb: "Steep faces snap into vertical steps while gentle ground stays smooth. Sea cliffs and mesa edges.",
      params: [
        num("threshold", "Cliff angle", 20, 80, 0.5, 45, "\xB0"),
        num("stepSize", "Step height", 10, 400, 1, 90, "m"),
        num("softness", "Edge softness", 1, 20, 0.5, 6, "\xB0")
      ],
      run(c, H, p) {
        const { N, cell, maxH } = c;
        const { gx, gy } = gradient(Float32Array.from(H, (v) => v * maxH), N, cell);
        const slope = slopeDegrees(gx, gy);
        const out = new Float32Array(H.length);
        const stepN = p.stepSize / maxH;
        for (let i = 0; i < H.length; i++) {
          const k = smoothstep(p.threshold - p.softness, p.threshold + p.softness, slope[i]);
          const q = Math.floor(H[i] / stepN) * stepN;
          const frac = (H[i] - q) / stepN;
          const snapped = q + stepN * smoothstep(0.35, 0.65, frac);
          out[i] = clamp(H[i] + (snapped - H[i]) * k, 0, 1);
        }
        return out;
      }
    }
  };

  // src/engine/masks.js
  function field(c, fn) {
    const out = new Float32Array(c.N * c.N);
    const inv = 1 / c.N;
    for (let y = 0; y < c.N; y++) {
      for (let x = 0; x < c.N; x++) out[y * c.N + x] = fn(x * inv, y * inv, y * c.N + x);
    }
    return out;
  }
  var MASKS = {
    coastal: {
      label: "Coastal falloff",
      blurb: "Fades the effect in from the shoreline, so coasts get a soft shelf instead of a hard line.",
      params: [
        num("width", "Falloff width", 50, 4e3, 10, 900, "m"),
        num("shore", "Shoreline offset", -500, 500, 5, 0, "m"),
        num("jitter", "Shoreline jitter", 0, 800, 5, 150, "m"),
        num("sharpness", "Falloff curve", 0.3, 3, 0.05, 1),
        choice("side", "Side", [["land", "Inland"], ["shelf", "Offshore shelf"]], "land"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p, H) {
        const { N, cell, maxH } = c;
        const n = c.noiseFor(p.seed + 17);
        const sea = c.seaM + p.shore;
        const cells = p.width / cell;
        const water = new Uint8Array(N * N);
        const land = new Uint8Array(N * N);
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const i = y * N + x;
            const jit = fbm(n.perlin, x * 6 / N, y * 6 / N, 4, 2, 0.5) * p.jitter * 2;
            const isLand = H[i] * maxH + jit > sea;
            land[i] = isLand ? 1 : 0;
            water[i] = isLand ? 0 : 1;
          }
        }
        if (p.side === "land") {
          const d2 = distanceFrom(water, N);
          return field(c, (u, v, i) => {
            if (!land[i]) return 0;
            return Math.pow(smootherstep(0, cells, d2[i]), p.sharpness);
          });
        }
        const d = distanceFrom(land, N);
        return field(c, (u, v, i) => {
          if (land[i]) return 0;
          return Math.pow(1 - smootherstep(0, cells, d[i]), p.sharpness);
        });
      }
    },
    elevation: {
      label: "Mountain falloff",
      blurb: "Smooth altitude falloff. Weight rises across a band of heights and rolls off near the summit.",
      params: [
        num("low", "Start height", 0, 1, 0.01, 0.3, "\xD7"),
        num("high", "Full height", 0, 1, 0.01, 0.7, "\xD7"),
        num("summitRoll", "Summit roll-off", 0, 1, 0.01, 0.25, "\xD7"),
        num("breakup", "Edge breakup", 0, 0.3, 5e-3, 0.04, "\xD7"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p, H) {
        const n = c.noiseFor(p.seed + 31);
        return field(c, (u, v, i) => {
          const h = H[i];
          const nz = fbm(n.perlin, u * 8, v * 8, 4, 2, 0.5) * 0.5 + 0.5 - 0.5;
          const hh = h + p.breakup * nz * 2;
          const band = smootherstep(p.low, Math.max(p.low + 1e-3, p.high), hh);
          return band * (1 - p.summitRoll * smootherstep(p.high, 1, hh));
        });
      }
    },
    slope: {
      label: "Slope",
      blurb: "Weight by steepness in degrees. Good for scree on the flanks and bare rock on the crags.",
      params: [
        num("min", "Start angle", 0, 80, 0.5, 8, "\xB0"),
        num("max", "Full angle", 0, 80, 0.5, 35, "\xB0")
      ],
      run(c, p, H) {
        const slope = c.derive(H).slope;
        return field(c, (u, v, i) => smoothstep(p.min, Math.max(p.min + 0.5, p.max), slope[i]));
      }
    },
    cliffs: {
      label: "Cliffs",
      blurb: "Only the steepest faces. Narrow bands with a breakup so the rock lines look geological, not drawn.",
      params: [
        num("threshold", "Cliff angle", 20, 80, 0.5, 42, "\xB0"),
        num("softness", "Edge softness", 1, 20, 0.5, 6, "\xB0"),
        num("breakup", "Breakup", 0, 1, 0.01, 0.3, "\xD7"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p, H) {
        const slope = c.derive(H).slope;
        const n = c.noiseFor(p.seed + 43);
        return field(c, (u, v, i) => {
          const band = smoothstep(p.threshold - p.softness, p.threshold + p.softness, slope[i]);
          const nz = fbm(n.perlin, u * 14, v * 14, 3, 2, 0.5) * 0.5 + 0.5;
          return band * (1 - p.breakup * (1 - nz));
        });
      }
    },
    strata: {
      label: "Stratify (strata)",
      blurb: "Horizontal bedding bands at a set interval, bent by warp. Ledges and layered sandstone.",
      params: [
        num("interval", "Bed interval", 10, 500, 1, 80, "m"),
        num("duty", "Ledge share", 0.05, 0.95, 0.01, 0.55),
        num("sharpness", "Bed sharpness", 0, 1, 0.01, 0.7),
        num("warp", "Bed warp", 0, 300, 1, 40, "m"),
        num("phase", "Phase", 0, 500, 1, 0, "m"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p, H) {
        const { maxH } = c;
        const n = c.noiseFor(p.seed + 59);
        const edge = (1 - p.sharpness) * 0.25 + 2e-3;
        return field(c, (u, v, i) => {
          const bend = fbm(n.perlin, u * 3, v * 3, 3, 2, 0.5) * p.warp;
          const t = (H[i] * maxH + p.phase + bend) / p.interval;
          const f = t - Math.floor(t);
          return 1 - smoothstep(p.duty - edge, p.duty + edge, f);
        });
      }
    },
    rift: {
      label: "Rift lines",
      blurb: "Thin bands along fault zones, from zero crossings of a warped noise field. Used to place cracks and grabens.",
      params: [
        num("frequency", "Fault frequency", 0.5, 8, 0.05, 2.2, "cycles"),
        num("width", "Fault zone width", 0.01, 0.3, 5e-3, 0.06),
        num("warp", "Fault warp", 0, 1, 0.01, 0.5, "\xD7"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed + 71);
        return field(c, (u, v) => {
          const wx = fbm(n.perlin, u * 2 + 4.1, v * 2 + 0.7, 3, 2, 0.5) * p.warp;
          const wy = fbm(n.perlin, u * 2 + 9.3, v * 2 + 6.2, 3, 2, 0.5) * p.warp;
          const z = n.perlin((u + wx * 0.5) * p.frequency, (v + wy * 0.5) * p.frequency);
          return 1 - smoothstep(0, p.width * 3, Math.abs(z));
        });
      }
    },
    ridges: {
      label: "Ridges (protrusion)",
      blurb: "Weights cells that stand above their surroundings. Picks out spurs, crests and peaks.",
      params: [
        num("scale", "Scale", 40, 2e3, 10, 260, "m"),
        num("min", "Start", -100, 200, 1, 0, "m"),
        num("max", "Full", 0, 600, 1, 60, "m")
      ],
      run(c, p, H) {
        const prot = c.derive(H).protrusion(p.scale);
        return field(c, (u, v, i) => smoothstep(p.min, Math.max(p.min + 1, p.max), prot[i]));
      }
    },
    noise: {
      label: "Generator noise",
      blurb: "A generator used as a mask. Breaks up any effect into organic patches.",
      params: [
        choice("generator", "Generator", [["perlin", "Perlin fBm"], ["ridged", "Ridged"], ["billow", "Billow"], ["voronoi", "Voronoi"]], "perlin"),
        num("frequency", "Frequency", 0.2, 12, 0.05, 3, "cycles"),
        int("octaves", "Octaves", 1, 10, 5),
        num("contrast", "Contrast", 0.2, 4, 0.05, 1.5),
        num("bias", "Bias", -1, 1, 0.01, 0),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p) {
        const g = runGenerator(p.generator, c, {
          frequency: p.frequency,
          octaves: p.octaves,
          seed: p.seed + 83,
          amplitude: 1,
          base: 0
        });
        return field(c, (u, v, i) => clamp((g[i] - 0.5) * p.contrast + 0.5 + p.bias, 0, 1));
      }
    }
  };
  var MASK_OPS = [
    ["multiply", "Multiply (both)"],
    ["add", "Add (either)"],
    ["subtract", "Subtract"],
    ["max", "Maximum"],
    ["min", "Minimum"]
  ];

  // src/engine/satmap.js
  var PALETTES = {
    sandstone: {
      label: "Sandstone bands",
      stops: [[0, "#3a2315"], [0.25, "#7e3f22"], [0.5, "#b8703f"], [0.75, "#dc9c64"], [1, "#f1cc99"]]
    },
    alpine: {
      label: "Alpine meadow to rock",
      stops: [[0, "#2d4a2a"], [0.3, "#4d6a3a"], [0.55, "#8b8a6b"], [0.75, "#8d8680"], [1, "#e7eaee"]]
    },
    snowrock: {
      label: "Snow and bare rock",
      stops: [[0, "#4a4d52"], [0.5, "#7d8189"], [0.8, "#cdd3dc"], [1, "#ffffff"]]
    },
    desert: {
      label: "Desert sand",
      stops: [[0, "#b98f58"], [0.5, "#dcb97e"], [1, "#f6e2b6"]]
    },
    volcanic: {
      label: "Basalt and ash",
      stops: [[0, "#131313"], [0.4, "#3a312d"], [0.7, "#6b5b52"], [1, "#a89383"]]
    },
    steppe: {
      label: "Dry steppe",
      stops: [[0, "#6a6b3e"], [0.5, "#a09a5b"], [1, "#d8c88f"]]
    },
    forest: {
      label: "Forest to scree",
      stops: [[0, "#1d3a1f"], [0.5, "#3b6a33"], [0.8, "#7c8a54"], [1, "#c9c9a2"]]
    },
    ice: {
      label: "Glacier ice",
      stops: [[0, "#7db0d4"], [0.5, "#cde5f1"], [1, "#ffffff"]]
    },
    coastal: {
      label: "Coastal sand and cliff",
      stops: [[0, "#2b2a27"], [0.35, "#6c6255"], [0.6, "#b49e7a"], [1, "#e6d6b4"]]
    },
    rock: {
      label: "Grey limestone",
      stops: [[0, "#2e2d2b"], [0.5, "#777268"], [1, "#c9c2b2"]]
    }
  };
  var CHANNELS = {
    altitude: "Altitude",
    slope: "Slope (steepness)",
    protrusion: "Protrusion (convexity)",
    rivers: "Rivers (drainage)",
    sediment: "Sedimentation",
    wetness: "Wetness",
    exposure: "Sun exposure"
  };
  var BLEND_MODES = [
    ["over", "Over"],
    ["multiply", "Multiply"],
    ["overlay", "Overlay"],
    ["screen", "Screen"],
    ["add", "Add"]
  ];
  var SATMAP_TYPE = {
    label: "Satmap",
    category: "satmap",
    blurb: "Colours the terrain from a channel or a generator, with palette, masks and breakup.",
    params: [
      choice("source", "Source", [["channel", "Terrain channel"], ["generator", "Generator"]], "channel"),
      choice("channel", "Channel", Object.entries(CHANNELS), "altitude"),
      choice("generator", "Generator", [["perlin", "Perlin fBm"], ["ridged", "Ridged"], ["billow", "Billow"], ["voronoi", "Voronoi"]], "perlin"),
      num("genFrequency", "Generator frequency", 0.2, 12, 0.05, 2.5, "cycles"),
      int("genOctaves", "Generator octaves", 1, 10, 5),
      choice("palette", "Palette", Object.entries(PALETTES).map(([k, v]) => [k, v.label]), "sandstone"),
      num("contrast", "Contrast", 0.2, 4, 0.05, 1),
      num("bias", "Bias", -0.5, 0.5, 0.01, 0),
      num("breakup", "Breakup", 0, 1, 0.01, 0.15, "\xD7"),
      num("breakupScale", "Breakup scale", 0.5, 16, 0.1, 6, "cycles"),
      choice("blend", "Blend mode", BLEND_MODES, "over"),
      int("seed", "Seed offset", 0, 999, 0)
    ]
  };
  var lutCache = /* @__PURE__ */ new Map();
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function paletteLut(id) {
    if (lutCache.has(id)) return lutCache.get(id);
    const pal = PALETTES[id] || PALETTES.sandstone;
    const lut = new Float32Array(256 * 3);
    for (let k = 0; k < 256; k++) {
      const t = k / 255;
      let a = pal.stops[0];
      let b = pal.stops[pal.stops.length - 1];
      for (let s = 0; s < pal.stops.length - 1; s++) {
        if (t >= pal.stops[s][0] && t <= pal.stops[s + 1][0]) {
          a = pal.stops[s];
          b = pal.stops[s + 1];
          break;
        }
      }
      const span = b[0] - a[0] || 1;
      const u = clamp((t - a[0]) / span, 0, 1);
      const ca = hexToRgb(a[1]);
      const cb = hexToRgb(b[1]);
      for (let ch = 0; ch < 3; ch++) lut[k * 3 + ch] = lerp(ca[ch], cb[ch], u);
    }
    lutCache.set(id, lut);
    return lut;
  }

  // src/engine/document.js
  var HEIGHT_TYPES = { ...GENERATORS, ...EROSIONS, ...MODIFIERS };
  var BLEND_HEIGHT = [
    ["replace", "Replace"],
    ["add", "Add"],
    ["subtract", "Subtract"],
    ["multiply", "Multiply"],
    ["max", "Maximum"],
    ["min", "Minimum"],
    ["mix", "Average"]
  ];
  var TERRAIN_PARAMS = [
    choice("size", "Grid size", [["128", "128 \xD7 128 (fast)"], ["256", "256 \xD7 256"], ["512", "512 \xD7 512 (slow)"]], "256"),
    num("cell", "Cell size", 5, 200, 1, 30, "m"),
    num("maxHeight", "Max relief", 100, 6e3, 10, 1800, "m"),
    num("seaLevel", "Sea level", 0, 3e3, 5, 400, "m"),
    int("seed", "Seed", 0, 99999, 1337)
  ];
  var SUN_PARAMS = [
    num("azimuth", "Sun azimuth", 0, 360, 1, 315, "\xB0"),
    num("elevation", "Sun elevation", 5, 85, 1, 38, "\xB0")
  ];
  function uid(prefix) {
    const r = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${r}${Date.now().toString(36).slice(-3)}`;
  }
  function layerInfo(type) {
    if (type === "satmap") return SATMAP_TYPE;
    return HEIGHT_TYPES[type] || null;
  }
  function makeLayer(type, overrides = {}) {
    const info = layerInfo(type);
    if (!info) throw new Error(`Unknown layer type ${type}`);
    const kind = info.category === "satmap" ? "satmap" : "height";
    return {
      id: overrides.id || uid("layer"),
      kind,
      type,
      name: overrides.name || info.label,
      enabled: true,
      opacity: 1,
      blend: "replace",
      params: { ...defaultsOf(info.params), ...overrides.params || {} },
      masks: overrides.masks || []
    };
  }
  function makeMask(type, overrides = {}) {
    const def = MASKS[type];
    if (!def) throw new Error(`Unknown mask ${type}`);
    return {
      id: overrides.id || uid("mask"),
      type,
      enabled: true,
      invert: false,
      strength: 1,
      op: "multiply",
      params: { ...defaultsOf(def.params), ...overrides.params || {} }
    };
  }
  function emptyDocument() {
    return {
      version: 2,
      name: "Untitled landscape",
      terrain: defaultsOf(TERRAIN_PARAMS),
      sun: defaultsOf(SUN_PARAMS),
      layers: []
    };
  }
  function normalizeDocument(raw) {
    const base = emptyDocument();
    const doc2 = {
      version: 2,
      name: typeof raw?.name === "string" ? raw.name : base.name,
      terrain: { ...base.terrain, ...raw?.terrain || {} },
      sun: { ...base.sun, ...raw?.sun || {} },
      layers: []
    };
    doc2.terrain.size = String(doc2.terrain.size);
    if (!["128", "256", "512"].includes(doc2.terrain.size)) doc2.terrain.size = "256";
    for (const l of raw?.layers || []) {
      const info = layerInfo(l.type);
      if (!info) continue;
      const kind = info.category === "satmap" ? "satmap" : "height";
      const masks = [];
      for (const m of l.masks || []) {
        const def = MASKS[m.type];
        if (!def) continue;
        masks.push({
          id: m.id || uid("mask"),
          type: m.type,
          enabled: m.enabled !== false,
          invert: !!m.invert,
          strength: typeof m.strength === "number" ? m.strength : 1,
          op: m.op || "multiply",
          params: { ...defaultsOf(def.params), ...m.params || {} }
        });
      }
      doc2.layers.push({
        id: l.id || uid("layer"),
        kind,
        type: l.type,
        name: l.name || info.label,
        enabled: l.enabled !== false,
        opacity: typeof l.opacity === "number" ? l.opacity : 1,
        blend: l.blend || "replace",
        params: { ...defaultsOf(info.params), ...l.params || {} },
        masks
      });
    }
    return doc2;
  }
  var MASK_LIST = Object.entries(MASKS).map(([k, v]) => [k, v.label]);
  var EROSION_LIST = Object.entries(EROSIONS).map(([k, v]) => [k, v.label]);
  var GENERATOR_LIST = Object.entries(GENERATORS).map(([k, v]) => [k, v.label]);
  var MODIFIER_LIST = Object.entries(MODIFIERS).map(([k, v]) => [k, v.label]);
  var PALETTE_LIST = Object.entries(PALETTES).map(([k, v]) => [k, v.label]);
  var CHANNEL_LIST = Object.entries(CHANNELS);

  // src/engine/render.js
  var VIEW_MODES = [
    ["shaded", "Shaded satmap"],
    ["satmap", "Satmap only"],
    ["height", "Height (greyscale)"],
    ["slope", "Slope"],
    ["rivers", "Rivers"],
    ["sediment", "Sedimentation"],
    ["exposure", "Sun exposure"],
    ["mask", "Selected layer mask"]
  ];
  function hillshade(result, sun, exaggeration = 1.6) {
    const { N, altitude, cell } = result;
    const out = new Float32Array(N * N);
    const az = sun.azimuth * Math.PI / 180;
    const el = sun.elevation * Math.PI / 180;
    const Lx = Math.cos(el) * Math.cos(az);
    const Ly = Math.cos(el) * Math.sin(az);
    const Lz = Math.sin(el);
    const k = 1 / (2 * cell) * exaggeration;
    for (let y = 0; y < N; y++) {
      const ym = Math.max(0, y - 1) * N;
      const yp = Math.min(N - 1, y + 1) * N;
      for (let x = 0; x < N; x++) {
        const xm = Math.max(0, x - 1);
        const xp = Math.min(N - 1, x + 1);
        const gx = (altitude[y * N + xp] - altitude[y * N + xm]) * k;
        const gy = (altitude[yp + x] - altitude[ym + x]) * k;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const l = clamp(-gx * inv * Lx - gy * inv * Ly + inv * Lz, 0, 1);
        out[y * N + x] = l;
      }
    }
    return out;
  }
  function grey(v) {
    const g = Math.round(clamp(v, 0, 1) * 255);
    return [g, g, g];
  }
  function ramp(id, v) {
    const lut = paletteLut(id);
    const k = Math.round(clamp(v, 0, 1) * 255) * 3;
    return [Math.round(lut[k] * 255), Math.round(lut[k + 1] * 255), Math.round(lut[k + 2] * 255)];
  }
  function renderView(result, mode, sun, opts = {}) {
    const { N } = result;
    const out = new Uint8ClampedArray(N * N * 4);
    const exag = opts.exaggeration ?? 1.6;
    let shade = null;
    if (mode === "shaded" || mode === "satmap") {
      shade = hillshade(result, sun, exag);
    }
    for (let i = 0; i < N * N; i++) {
      let rgb;
      switch (mode) {
        case "shaded": {
          const s = 0.5 + 0.5 * shade[i];
          const j = i * 4;
          out[j] = result.rgba[j] * s;
          out[j + 1] = result.rgba[j + 1] * s;
          out[j + 2] = result.rgba[j + 2] * s;
          out[j + 3] = 255;
          continue;
        }
        case "satmap":
          rgb = [result.rgba[i * 4], result.rgba[i * 4 + 1], result.rgba[i * 4 + 2]];
          break;
        case "height":
          rgb = grey(result.height[i]);
          break;
        case "slope":
          rgb = ramp("volcanic", result.slope[i] / 60);
          break;
        case "rivers":
          rgb = ramp("ice", result.rivers[i]);
          break;
        case "sediment":
          rgb = ramp("desert", result.sediment[i]);
          break;
        case "exposure":
          rgb = grey(result.exposure[i]);
          break;
        case "mask": {
          const m = result.mask ? result.mask[i] : 1;
          rgb = [Math.round(m * 255), Math.round(m * 200), Math.round((1 - m) * 60)];
          break;
        }
        default:
          rgb = grey(result.height[i]);
      }
      out[i * 4] = rgb[0];
      out[i * 4 + 1] = rgb[1];
      out[i * 4 + 2] = rgb[2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  function renderVoxel(result, sun, cam, w, h) {
    const { N, cell } = result;
    const out = new Uint8ClampedArray(w * h * 4);
    const shade = hillshade(result, sun, 1.6);
    const hfov = cam.fov * Math.PI / 180;
    const focal = w / (2 * Math.tan(hfov / 2));
    const horizon = h * cam.horizon;
    const worldW = N * cell;
    const zNear = cell * 1.5;
    const zFar = worldW * 1.5;
    for (let y = 0; y < h; y++) {
      const t = clamp(y / Math.max(1, horizon), 0, 1);
      const r = 20 + 60 * t;
      const g = 28 + 70 * t;
      const b = 40 + 90 * t;
      for (let x = 0; x < w; x++) {
        const j = (y * w + x) * 4;
        out[j] = r;
        out[j + 1] = g;
        out[j + 2] = b;
        out[j + 3] = 255;
      }
    }
    const cx = cam.x * worldW;
    const cy = cam.y * worldW;
    const cz = result.altitude[Math.min(N - 1, Math.max(0, Math.floor(cam.y * N))) * N + Math.min(N - 1, Math.max(0, Math.floor(cam.x * N)))] + cam.height;
    const fogCol = [150, 170, 185];
    for (let col = 0; col < w; col++) {
      const screenDx = (col - w / 2) / focal;
      const ang = cam.angle + Math.atan(screenDx);
      const dx = Math.sin(ang);
      const dy = Math.cos(ang);
      let ybot = h;
      let z = zNear;
      let dz = cell * 0.5;
      while (z < zFar && ybot > 0) {
        const px = cx + dx * z;
        const py = cy + dy * z;
        const ix = Math.floor(px / cell);
        const iy = Math.floor(py / cell);
        if (ix >= 0 && iy >= 0 && ix < N && iy < N) {
          const idx = iy * N + ix;
          const hz = result.altitude[idx];
          const sy = horizon + (cz - hz) * focal / z;
          if (sy < ybot) {
            const top = Math.max(0, Math.floor(sy));
            const bottom = Math.min(h, Math.floor(ybot));
            const sh = shade[idx] * 0.85 + 0.15;
            const fog = clamp((z - zFar * 0.45) / (zFar * 0.55), 0, 1);
            for (let y = top; y < bottom; y++) {
              const j = (y * w + col) * 4;
              const r = result.rgba[idx * 4] * sh;
              const g = result.rgba[idx * 4 + 1] * sh;
              const b = result.rgba[idx * 4 + 2] * sh;
              out[j] = r + (fogCol[0] - r) * fog;
              out[j + 1] = g + (fogCol[1] - g) * fog;
              out[j + 2] = b + (fogCol[2] - b) * fog;
            }
            ybot = top;
          }
        }
        z += dz;
        dz = Math.max(cell * 0.5, z * 4e-3);
      }
    }
    return out;
  }

  // src/engine/presets.js
  var L = (type, id, name, params = {}, masks = [], extra = {}) => {
    const layer = makeLayer(type, { id, name, params, masks });
    return { ...layer, ...extra };
  };
  var M = (type, params = {}, extra = {}) => ({ ...makeMask(type, { params }), ...extra });
  function doc(name, terrain, layers, sun) {
    const base = emptyDocument();
    return normalizeDocument({
      ...base,
      name,
      terrain: { ...base.terrain, ...terrain },
      sun: { ...base.sun, ...sun || {} },
      layers
    });
  }
  var satmap = (id, name, params, masks = [], extra = {}) => L("satmap", id, name, params, masks, extra);
  var PRESETS = {
    canyons: {
      label: "Canyons (sandstone)",
      build: () => doc(
        "Sandstone canyons",
        { size: "256", cell: 32, maxHeight: 900, seaLevel: 0, seed: 4021 },
        [
          L("perlin", "plateau", "Plateau base", { frequency: 1.4, octaves: 6, warp: 0.35, amplitude: 0.62, base: 0.26, seed: 1 }),
          L("rift", "canyon-cut", "Canyon carve", { depth: 280, frequency: 1.8, width: 0.075, wall: 0.8, warp: 0.6 }, [M("elevation", { low: 0.28, high: 0.6, summitRoll: 0.4 })]),
          L("stream", "river-cut", "River incision", { iterations: 10, erodibility: 0.04, maxStep: 26 }),
          L("terrace", "strata", "Sandstone strata", { steps: 16, smooth: 0.25 }, [M("elevation", { low: 0.3, high: 0.7, summitRoll: 0 }), M("strata", { interval: 55, duty: 0.58, sharpness: 0.8, warp: 30 }, { op: "multiply" })]),
          L("hydraulic", "rain", "Rain gullies", { density: 1.1, lifetime: 70, erosionRate: 0.35, depositRate: 0.25, radius: 2 }),
          L("thermal", "scree", "Talus slopes", { talus: 33, iterations: 30 }),
          satmap("sand-base", "Sandstone colour", { palette: "sandstone", channel: "altitude", contrast: 1.2, breakup: 0.3, breakupScale: 9 }),
          satmap("sed-sand", "Sediment dust", { palette: "desert", channel: "sediment", contrast: 1.6, blend: "over", breakup: 0.2 }, [M("ridges", { min: -10, max: 40, scale: 120 }, { invert: true })], { opacity: 0.55 }),
          satmap("rivers", "Dark river beds", { palette: "volcanic", channel: "rivers", contrast: 2, blend: "multiply", breakup: 0 }, [], { opacity: 0.6 })
        ],
        { azimuth: 250, elevation: 28 }
      )
    },
    sandstoneCliffs: {
      label: "Sandstone cliffs",
      build: () => doc(
        "Sandstone cliffs",
        { size: "256", cell: 30, maxHeight: 1100, seaLevel: 0, seed: 778 },
        [
          L("flat", "mesa", "Mesa table", { level: 0.42 }),
          L("perlin", "rise", "Rolling rise", { frequency: 1.6, octaves: 5, warp: 0.25, amplitude: 0.3, base: 0.3, seed: 2 }, [], { blend: "add" }),
          L("cliffSculpt", "cliff-steps", "Cliff steps", { threshold: 40, stepSize: 110, softness: 7 }, [M("cliffs", { threshold: 35, softness: 8, breakup: 0.35 })]),
          L("terrace", "bedding", "Bedding planes", { steps: 14, smooth: 0.35 }, [M("strata", { interval: 60, duty: 0.6, sharpness: 0.9, warp: 60 })]),
          L("thermal", "talus", "Cliff talus", { talus: 30, iterations: 60, rate: 0.45 }),
          L("stream", "gullies", "Drainage", { iterations: 6, erodibility: 0.025 }),
          satmap("bands", "Stratified sandstone", { palette: "sandstone", channel: "altitude", contrast: 1.4, breakup: 0.1 }),
          satmap("cliff-face", "Cliff faces", { palette: "volcanic", channel: "slope", contrast: 1.5, blend: "multiply", breakup: 0.4 }, [], { opacity: 0.7 }),
          satmap("talus-sand", "Talus fans", { palette: "desert", channel: "sediment", contrast: 1.5, blend: "over" }, [M("slope", { min: 0, max: 22 }, { invert: true })], { opacity: 0.7 })
        ],
        { azimuth: 300, elevation: 34 }
      )
    },
    coastalCliffs: {
      label: "Coastal cliffs",
      build: () => doc(
        "Coastal cliffs",
        { size: "256", cell: 25, maxHeight: 420, seaLevel: 60, seed: 2201 },
        [
          L("island", "landmass", "Landmass", { radius: 0.5, falloff: 0.28, frequency: 2.6, warp: 0.4, amplitude: 0.85, base: 0.12, seed: 3 }),
          L("perlin", "headland", "Headland detail", { frequency: 3.2, octaves: 5, amplitude: 0.25, base: 0, seed: 4 }, [M("coastal", { width: 700, jitter: 260, side: "land" })], { blend: "add" }),
          L("cliffSculpt", "sea-cliffs", "Sea cliffs", { threshold: 34, stepSize: 40, softness: 5 }, [M("coastal", { width: 320, jitter: 90, sharpness: 1.2, side: "land" }, { invert: true })]),
          L("thermal", "cliff-foot", "Cliff foot talus", { talus: 28, iterations: 40 }, [M("coastal", { width: 240, side: "land" })]),
          L("stream", "creeks", "Coastal creeks", { iterations: 5, erodibility: 0.02, maxStep: 8 }),
          satmap("coast-sand", "Beach sand", { palette: "coastal", channel: "altitude", contrast: 1.1 }, [M("coastal", { width: 130, jitter: 50, side: "shelf" })]),
          satmap("cliff-dark", "Dark cliff rock", { palette: "rock", channel: "slope", contrast: 1.6, blend: "multiply" }, [M("slope", { min: 18, max: 40 })], { opacity: 0.9 }),
          satmap("wet", "Wet rock and grass", { palette: "forest", channel: "wetness", contrast: 1.3, blend: "multiply", breakup: 0.2 }, [], { opacity: 0.35 })
        ],
        { azimuth: 220, elevation: 30 }
      )
    },
    himalaya: {
      label: "Himalayan mountains",
      build: () => doc(
        "Himalayan range",
        { size: "256", cell: 45, maxHeight: 6200, seaLevel: 250, seed: 8848 },
        [
          L("mountain", "range", "Range core", { frequency: 1.4, octaves: 8, sharpness: 1.9, coverage: 0.6, peaks: 1.6, amplitude: 1, base: 0.05, warp: 0.7, seed: 5 }),
          L("multifractal", "massif", "Massif detail", { frequency: 3.5, octaves: 9, roughness: 0.9, offset: 0.9, amplitude: 0.35, base: 0, warp: 0.5, seed: 6 }, [M("elevation", { low: 0.25, high: 0.7, summitRoll: 0.1 })], { blend: "add" }),
          L("stream", "trunk", "Trunk valleys", { iterations: 14, erodibility: 0.07, uplift: 2, maxStep: 40, areaExp: 0.45 }),
          L("glacial", "glaciers", "Glacial valleys", { iceline: 0.55, intensity: 0.8, smoothing: 0.6, cirque: 0.5, iterations: 8 }, [M("elevation", { low: 0.5, high: 0.8, summitRoll: 0 })]),
          L("hydraulic", "monsoon", "Monsoon gullies", { density: 0.8, lifetime: 80, erosionRate: 0.25, depositRate: 0.3, radius: 2 }),
          L("thermal", "rockfall", "Rockfall talus", { talus: 42, iterations: 40 }, [M("slope", { min: 25, max: 50 })]),
          satmap("base", "Forest to scree", { palette: "forest", channel: "altitude", contrast: 1.2, breakup: 0.2 }, [], {}),
          satmap("alpine", "Alpine meadow", { palette: "alpine", channel: "altitude", contrast: 1.3, bias: -0.05 }, [M("elevation", { low: 0.35, high: 0.7 })], { opacity: 0.9 }),
          satmap("snow", "Snowcaps", { palette: "snowrock", channel: "exposure", contrast: 1.8, bias: 0.15, breakup: 0.25, blend: "over" }, [M("elevation", { low: 0.7, high: 0.82 })]),
          satmap("rock", "Bare rock", { palette: "rock", channel: "slope", contrast: 1.3, blend: "multiply" }, [M("slope", { min: 22, max: 40 })], { opacity: 0.75 })
        ],
        { azimuth: 300, elevation: 42 }
      )
    },
    iceland: {
      label: "Icelandic highlands",
      build: () => doc(
        "Icelandic highlands",
        { size: "256", cell: 35, maxHeight: 1400, seaLevel: 120, seed: 1104 },
        [
          L("perlin", "tundra", "Highland plateau", { frequency: 1.2, octaves: 5, warp: 0.3, amplitude: 0.5, base: 0.22, seed: 7 }),
          L("voronoi", "lava-plates", "Lava plateaux", { frequency: 5, jitter: 0.95, steps: 6, edge: 0.4, amplitude: 0.35, base: 0.05, seed: 8 }, [M("elevation", { low: 0.25, high: 0.6 })], { blend: "add" }),
          L("ridged", "shield-ridges", "Eruption ridges", { frequency: 2.4, octaves: 5, sharpness: 1.4, amplitude: 0.3, base: 0, warp: 0.4, seed: 9 }, [M("ridges", { min: 0, max: 80 })], { blend: "add" }),
          L("glacial", "valleys", "Glacial valleys", { iceline: 0.7, intensity: 0.5, smoothing: 0.7, cirque: 0.3, iterations: 5 }),
          L("stream", "braids", "Braided rivers", { iterations: 6, erodibility: 0.025, areaExp: 0.4 }),
          L("smooth", "lava-soft", "Lava smoothing", { radius: 2, detail: 0.6 }),
          satmap("moss", "Moss and lava", { palette: "volcanic", channel: "altitude", contrast: 1.1, breakup: 0.35, breakupScale: 10 }),
          satmap("moss-green", "Moss in the valleys", { palette: "forest", channel: "wetness", contrast: 1.6, blend: "multiply", breakup: 0.3 }, [], { opacity: 0.8 }),
          satmap("snow", "Ice caps", { palette: "ice", channel: "altitude", contrast: 1.5, bias: 0.2 }, [M("elevation", { low: 0.82, high: 0.92 })])
        ],
        { azimuth: 200, elevation: 32 }
      )
    },
    alps: {
      label: "Alps",
      build: () => doc(
        "Alpine massif",
        { size: "256", cell: 40, maxHeight: 3800, seaLevel: 300, seed: 4810 },
        [
          L("mountain", "massif", "Alpine massif", { frequency: 1.8, octaves: 8, sharpness: 1.6, coverage: 0.7, peaks: 1.2, base: 0.08, amplitude: 0.92, warp: 0.6, seed: 10 }),
          L("glacial", "u-valleys", "U-shaped valleys", { iceline: 0.5, intensity: 1, smoothing: 0.85, cirque: 0.6, iterations: 12 }),
          L("stream", "rivers", "Alpine rivers", { iterations: 10, erodibility: 0.05, maxStep: 30 }),
          L("thermal", "scree", "Scree slopes", { talus: 36, iterations: 50 }, [M("slope", { min: 22, max: 42 })]),
          L("sharpen", "ar\xEAtes", "Ar\xEAtes", { amount: 0.7, radius: 7 }, [M("elevation", { low: 0.5, high: 0.85 })]),
          satmap("meadow", "Valley meadow", { palette: "alpine", channel: "altitude", contrast: 1.2, breakup: 0.15 }),
          satmap("wet", "Wet valley floor", { palette: "forest", channel: "rivers", contrast: 1.8, blend: "multiply" }, [], { opacity: 0.45 }),
          satmap("snow", "Snow above the firn line", { palette: "snowrock", channel: "exposure", contrast: 1.6, bias: 0.2, blend: "over", breakup: 0.2 }, [M("elevation", { low: 0.62, high: 0.75 })]),
          satmap("rock", "Rock faces", { palette: "rock", channel: "slope", contrast: 1.4, blend: "multiply" }, [M("slope", { min: 26, max: 45 })], { opacity: 0.7 })
        ],
        { azimuth: 290, elevation: 40 }
      )
    },
    snowyMountains: {
      label: "Snowy mountains",
      build: () => doc(
        "Snowy peaks",
        { size: "256", cell: 38, maxHeight: 4200, seaLevel: 200, seed: 6120 },
        [
          L("ridged", "peaks", "Sharp peaks", { frequency: 2.2, octaves: 7, sharpness: 1.9, amplitude: 1, base: 0.05, warp: 0.5, seed: 12 }),
          L("multifractal", "rough", "Rough crags", { frequency: 4, octaves: 8, roughness: 1, offset: 0.95, amplitude: 0.25, base: 0, seed: 13 }, [M("elevation", { low: 0.45, high: 0.8 })], { blend: "add" }),
          L("glacial", "cirques", "Cirques", { iceline: 0.6, intensity: 0.7, smoothing: 0.4, cirque: 0.9, iterations: 8 }),
          L("thermal", "debris", "Debris cones", { talus: 38, iterations: 45 }),
          L("hydraulic", "meltwater", "Meltwater", { density: 0.7, lifetime: 60, erosionRate: 0.2, depositRate: 0.3 }),
          satmap("snow", "Fresh snow", { palette: "ice", channel: "exposure", contrast: 2, bias: 0.25, blend: "over" }, [M("elevation", { low: 0.45, high: 0.7 })]),
          satmap("rock-peaks", "Peak rock", { palette: "rock", channel: "altitude", contrast: 1.4, blend: "over" }, [M("slope", { min: 30, max: 50 })]),
          satmap("shade", "Shaded snow", { palette: "snowrock", channel: "protrusion", contrast: 1.3, blend: "multiply", breakup: 0.2 }, [], { opacity: 0.4 })
        ],
        { azimuth: 210, elevation: 36 }
      )
    },
    outcrops: {
      label: "Rugged outcrops",
      build: () => doc(
        "Rugged outcrops",
        { size: "256", cell: 28, maxHeight: 1e3, seaLevel: 0, seed: 3333 },
        [
          L("perlin", "ground", "Rolling ground", { frequency: 2, octaves: 6, amplitude: 0.4, base: 0.2, seed: 14 }),
          L("voronoi", "boulders", "Outcrop cells", { frequency: 9, jitter: 1, steps: 0, edge: 0.2, amplitude: 0.4, base: 0, seed: 15 }, [M("elevation", { low: 0.3, high: 0.65 })], { blend: "add" }),
          L("sharpen", "crags", "Crag sharpening", { amount: 1.6, radius: 5 }),
          L("cliffSculpt", "shelves", "Rock shelves", { threshold: 48, stepSize: 35, softness: 4 }, [M("cliffs", { threshold: 40, breakup: 0.5 })]),
          L("hydraulic", "weather", "Weathering", { density: 0.6, lifetime: 45, erosionRate: 0.2, depositRate: 0.4 }),
          L("thermal", "rubble", "Rubble", { talus: 40, iterations: 25 }),
          satmap("rock", "Grey outcrop rock", { palette: "rock", channel: "altitude", contrast: 1.5, breakup: 0.3, breakupScale: 10 }),
          satmap("lichen", "Lichen", { palette: "steppe", channel: "protrusion", contrast: 1.2, blend: "over", breakup: 0.5 }, [M("ridges", { min: 0, max: 30 })], { opacity: 0.5 }),
          satmap("shadow", "Crevice shadow", { palette: "volcanic", channel: "slope", contrast: 1.5, blend: "multiply" }, [], { opacity: 0.4 })
        ],
        { azimuth: 235, elevation: 36 }
      )
    },
    dunes: {
      label: "Desert dunes",
      build: () => doc(
        "Desert dunes",
        { size: "256", cell: 40, maxHeight: 300, seaLevel: 0, seed: 5511 },
        [
          L("perlin", "sand-base", "Sand sheet", { frequency: 1.2, octaves: 4, warp: 0.2, amplitude: 0.45, base: 0.2, seed: 16 }),
          L("billow", "dune-field", "Dune field", { frequency: 3.5, octaves: 3, gain: 0.45, amplitude: 0.5, base: 0.05, seed: 17 }, [M("elevation", { low: 0.15, high: 0.5 })], { blend: "add" }),
          L("aeolian", "wind", "Wind sculpting", { direction: 215, strength: 0.7, saltation: 7, iterations: 140 }),
          L("smooth", "soften", "Soften sand", { radius: 2, detail: 0.5 }),
          satmap("sand", "Dune sand", { palette: "desert", channel: "altitude", contrast: 1.2, breakup: 0.15 }),
          satmap("dune-deposit", "Lee deposits", { palette: "desert", channel: "sediment", contrast: 1.8, blend: "over" }, [], { opacity: 0.7 }),
          satmap("shade", "Windward light and lee shade", { palette: "volcanic", channel: "slope", contrast: 1, blend: "multiply" }, [], { opacity: 0.3 })
        ],
        { azimuth: 260, elevation: 34 }
      )
    },
    rockyDesert: {
      label: "Rocky desert",
      build: () => doc(
        "Rocky desert",
        { size: "256", cell: 34, maxHeight: 700, seaLevel: 0, seed: 9099 },
        [
          L("perlin", "pan", "Desert pan", { frequency: 1.6, octaves: 6, warp: 0.4, amplitude: 0.35, base: 0.15, seed: 18 }),
          L("voronoi", "mesas", "Mesa plates", { frequency: 3.5, jitter: 0.9, steps: 5, edge: 0.45, amplitude: 0.35, base: 0.05, seed: 19 }, [M("elevation", { low: 0.3, high: 0.6, summitRoll: 0.2 })], { blend: "add" }),
          L("terrace", "bench", "Desert benches", { steps: 9, smooth: 0.5 }, [M("strata", { interval: 45, duty: 0.5, sharpness: 0.6 })]),
          L("stream", "wadis", "Wadis", { iterations: 4, erodibility: 0.02, maxStep: 15 }),
          L("aeolian", "wind", "Wind polish", { direction: 240, strength: 0.4, saltation: 4, iterations: 50 }),
          L("thermal", "rubble", "Rock fall", { talus: 37, iterations: 25 }),
          satmap("base", "Desert pavement", { palette: "desert", channel: "altitude", contrast: 1.15, breakup: 0.25 }),
          satmap("rock", "Dark rock varnish", { palette: "volcanic", channel: "slope", contrast: 1.4, blend: "multiply" }, [M("slope", { min: 14, max: 36 })], { opacity: 0.75 }),
          satmap("wadi", "Wadi washes", { palette: "steppe", channel: "rivers", contrast: 1.8, blend: "over" }, [], { opacity: 0.4 })
        ],
        { azimuth: 230, elevation: 40 }
      )
    }
  };
  var PRESET_LIST = Object.entries(PRESETS).map(([k, v]) => [k, v.label]);
  function buildPreset(id) {
    const p = PRESETS[id];
    if (!p) throw new Error(`Unknown preset ${id}`);
    return p.build();
  }

  // src/ui/main.jsx
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var CATEGORY_ICON = {
    generator: "icons/terrain.svg",
    erosion: "icons/fluid.svg",
    modifier: "icons/mesh.svg",
    satmap: "icons/editor-texture.svg"
  };
  var CATEGORY_NAME = { generator: "Base shape", erosion: "Erosion", modifier: "Modifier", satmap: "Satmap" };
  var HEIGHT_GROUPS = [
    ["Base shape (generators)", GENERATOR_LIST],
    ["Erosion", EROSION_LIST],
    ["Modifiers", MODIFIER_LIST]
  ];
  function App() {
    const [state, setState] = (0, import_react2.useState)(() => ({ doc: buildPreset("alps"), past: [], future: [], key: null }));
    const doc2 = state.doc;
    const [selId, setSelId] = (0, import_react2.useState)(null);
    const [viewMode, setViewMode] = (0, import_react2.useState)("shaded");
    const [dim, setDim] = (0, import_react2.useState)("2d");
    const [result, setResult] = (0, import_react2.useState)(null);
    const [busy, setBusy] = (0, import_react2.useState)(false);
    const [error, setError] = (0, import_react2.useState)(null);
    const workerRef = (0, import_react2.useRef)(null);
    const reqRef = (0, import_react2.useRef)(0);
    const commit = (0, import_react2.useCallback)((mutate, coalesce) => {
      setState((s) => {
        const next = mutate(structuredClone(s.doc));
        if (!next) return s;
        const past = coalesce && s.key === coalesce ? s.past : [...s.past, s.doc].slice(-80);
        return { doc: next, past, future: [], key: coalesce || null };
      });
    }, []);
    const undo = () => setState((s) => s.past.length ? { doc: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.doc, ...s.future], key: null } : s);
    const redo = () => setState((s) => s.future.length ? { doc: s.future[0], past: [...s.past, s.doc], future: s.future.slice(1), key: null } : s);
    (0, import_react2.useEffect)(() => {
      const w = new Worker("worker.js");
      w.onmessage = (e) => {
        if (e.data.id !== reqRef.current) return;
        if (e.data.error) setError(e.data.error);
        else {
          setError(null);
          setResult(e.data.result);
        }
        setBusy(false);
      };
      workerRef.current = w;
      return () => w.terminate();
    }, []);
    (0, import_react2.useEffect)(() => {
      const id = ++reqRef.current;
      setBusy(true);
      const t = setTimeout(() => workerRef.current.postMessage({ id, doc: doc2, maskLayerId: selId }), 140);
      return () => clearTimeout(t);
    }, [doc2, selId]);
    const selected = doc2.layers.find((l) => l.id === selId) || null;
    const updateLayer = (id, patch, key) => commit((d) => {
      d.layers = d.layers.map((l) => l.id === id ? { ...l, ...typeof patch === "function" ? patch(l) : patch } : l);
      return d;
    }, key);
    const setParam = (id, k, v) => updateLayer(id, (l) => ({ params: { ...l.params, [k]: v } }), `${id}.${k}`);
    const addLayer = (type) => {
      const layer = makeLayer(type);
      commit((d) => {
        const kind = layer.kind;
        const idx = d.layers.map((l, i) => l.kind === kind ? i : -1).filter((i) => i >= 0);
        const at = idx.length ? idx[idx.length - 1] + 1 : d.layers.length;
        d.layers.splice(at, 0, layer);
        return d;
      });
      setSelId(layer.id);
    };
    const removeLayer = (id) => {
      commit((d) => {
        d.layers = d.layers.filter((l) => l.id !== id);
        return d;
      });
      if (selId === id) setSelId(null);
    };
    const duplicateLayer = (id) => {
      const src = doc2.layers.find((l) => l.id === id);
      if (!src) return;
      const copy = { ...structuredClone(src), id: makeLayer(src.type).id, name: src.name + " copy" };
      copy.masks = copy.masks.map((m) => ({ ...m, id: makeMask(m.type).id }));
      commit((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        d.layers.splice(i + 1, 0, copy);
        return d;
      });
      setSelId(copy.id);
    };
    const moveLayer = (id, dir) => commit((d) => {
      const kind = d.layers.find((l) => l.id === id)?.kind;
      const same = d.layers.map((l, i) => l.kind === kind ? i : -1).filter((i) => i >= 0);
      const pos = same.findIndex((i) => d.layers[i].id === id);
      const target = same[pos + dir];
      if (target === void 0) return null;
      const from = d.layers.findIndex((l) => l.id === id);
      [d.layers[from], d.layers[target]] = [d.layers[target], d.layers[from]];
      return d;
    });
    const changeType = (id, type) => commit((d) => {
      const info = layerInfo(type);
      d.layers = d.layers.map((l) => {
        if (l.id !== id) return l;
        const fresh = makeLayer(type, { id: l.id, name: info.label });
        return { ...l, type, kind: fresh.kind, name: info.label, params: fresh.params, blend: "replace" };
      });
      return d;
    });
    const addMask = (layerId, type) => commit((d) => {
      d.layers = d.layers.map((l) => l.id === layerId ? { ...l, masks: [...l.masks, makeMask(type)] } : l);
      return d;
    });
    const updateMask = (layerId, maskId, patch, key) => commit(
      (d) => {
        d.layers = d.layers.map((l) => {
          if (l.id !== layerId) return l;
          return {
            ...l,
            masks: l.masks.map((m) => m.id === maskId ? { ...m, ...typeof patch === "function" ? patch(m) : patch } : m)
          };
        });
        return d;
      },
      key
    );
    const removeMask = (layerId, maskId) => commit((d) => {
      d.layers = d.layers.map((l) => l.id === layerId ? { ...l, masks: l.masks.filter((m) => m.id !== maskId) } : l);
      return d;
    });
    const changeMaskType = (layerId, maskId, type) => commit((d) => {
      d.layers = d.layers.map((l) => {
        if (l.id !== layerId) return l;
        return { ...l, masks: l.masks.map((m) => m.id === maskId ? makeMask(type, { id: m.id, op: m.op }) : m) };
      });
      return d;
    });
    const exportHeight = () => {
      if (!result) return;
      const buf = new Uint16Array(result.height.length);
      for (let i = 0; i < buf.length; i++) buf[i] = Math.round(Math.min(1, Math.max(0, result.height[i])) * 65535);
      download(`${doc2.name.replace(/\s+/g, "-").toLowerCase()}-${result.N}.r16`, new Blob([buf.buffer], { type: "application/octet-stream" }));
    };
    const exportSatmap = () => {
      if (!result) return;
      const c = document.createElement("canvas");
      c.width = result.N;
      c.height = result.N;
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(result.rgba), result.N, result.N), 0, 0);
      c.toBlob((b) => b && download(`${doc2.name.replace(/\s+/g, "-").toLowerCase()}-satmap.png`, b), "image/png");
    };
    const saveDoc = () => download(`${doc2.name.replace(/\s+/g, "-").toLowerCase()}.landscape.json`, new Blob([JSON.stringify(doc2, null, 2)], { type: "application/json" }));
    const loadDoc = async (file) => {
      if (!file) return;
      const text = await file.text();
      commit(() => normalizeDocument(JSON.parse(text)));
      setSelId(null);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "app", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: "topbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "brand", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "brand-mark", children: "\u25B2" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Landscape" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "doc-name", value: doc2.name, onChange: (e) => commit((d) => ({ ...d, name: e.target.value }), "name") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "top-group", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Select,
          {
            label: "Preset",
            value: "",
            options: [["", "Load a preset\u2026"], ...PRESET_LIST],
            onChange: (id) => {
              if (!id) return;
              commit(() => buildPreset(id));
              setSelId(null);
            }
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "top-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: undo, disabled: !state.past.length, title: "Undo", children: "\u21B6 Undo" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: redo, disabled: !state.future.length, title: "Redo", children: "\u21B7 Redo" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "top-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "file-button", children: [
            "Open JSON",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "file", accept: ".json,application/json", onChange: (e) => loadDoc(e.target.files[0]) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: saveDoc, children: "Save JSON" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: exportHeight, disabled: !result, children: "Export .r16" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: exportSatmap, disabled: !result, children: "Export satmap" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `status-disc ${busy ? "busy" : ""}`, title: busy ? "Evaluating" : "Up to date" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "workspace", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("aside", { className: "dock left-dock", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          LayerStack,
          {
            doc: doc2,
            selId,
            onSelect: setSelId,
            onAdd: addLayer,
            onRemove: removeLayer,
            onDuplicate: duplicateLayer,
            onMove: moveLayer,
            onToggle: (id) => updateLayer(id, (l) => ({ enabled: !(l.enabled !== false) })),
            stats: result?.stats
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("main", { className: "dock viewport-dock", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "viewport-toolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "viewport-modes", role: "group", "aria-label": "Viewport mode", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: dim === "2d" ? "active" : "", onClick: () => setDim("2d"), children: "Map" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: dim === "3d" ? "active" : "", onClick: () => setDim("3d"), children: "Perspective" })
            ] }),
            dim === "2d" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { label: "View", value: viewMode, options: VIEW_MODES, onChange: setViewMode })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Viewport, { result, dim, viewMode, sun: doc2.sun }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("footer", { className: "viewport-footer", children: [
            result ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                result.N,
                " \xD7 ",
                result.N,
                " cells"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                (result.N * result.cell / 1e3).toFixed(1),
                " km \xD7 ",
                (result.N * result.cell / 1e3).toFixed(1),
                " km"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                "altitude ",
                result.stats.minM.toFixed(0),
                " \u2013 ",
                result.stats.maxM.toFixed(0),
                " m"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                result.stats.ms.toFixed(0),
                " ms"
              ] }),
              result.stats.errors.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "err", children: [
                result.stats.errors.length,
                " layer error(s)"
              ] })
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Evaluating\u2026" }),
            error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "err", children: error })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("aside", { className: "dock right-dock", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Inspector,
          {
            doc: doc2,
            layer: selected,
            result,
            commit,
            setParam,
            updateLayer,
            changeType,
            addMask,
            updateMask,
            removeMask,
            changeMaskType,
            viewMode,
            setViewMode
          }
        ) })
      ] })
    ] });
  }
  function LayerStack({ doc: doc2, selId, onSelect, onAdd, onRemove, onDuplicate, onMove, onToggle, stats }) {
    const addGroups = [
      ["Base shape", GENERATOR_LIST.map(([k, l]) => [k, l])],
      ["Erosion", EROSION_LIST],
      ["Modifiers", MODIFIER_LIST],
      ["Satmap", [["satmap", SATMAP_TYPE.label]]]
    ];
    const height = doc2.layers.filter((l) => l.kind === "height");
    const satmap2 = doc2.layers.filter((l) => l.kind === "satmap");
    const timeOf = (id) => stats?.layers?.find((x) => x.id === id);
    const row = (layer, i, count) => {
      const info = layerInfo(layer.type);
      const err = stats?.errors?.some((e) => e.id === layer.id);
      const t = timeOf(layer.id);
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "div",
        {
          className: `layer-row ${selId === layer.id ? "selected" : ""} ${layer.enabled === false ? "off" : ""} ${err ? "error" : ""}`,
          onClick: () => onSelect(layer.id),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                className: "eye",
                title: layer.enabled === false ? "Show" : "Hide",
                onClick: (e) => {
                  e.stopPropagation();
                  onToggle(layer.id);
                },
                children: layer.enabled === false ? "\u25CB" : "\u25CF"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { className: "layer-icon", src: CATEGORY_ICON[info.category], alt: "" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "layer-id", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "layer-name", children: layer.name }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "layer-sub", children: [
                CATEGORY_NAME[info.category],
                layer.masks.length ? ` \xB7 ${layer.masks.length} mask${layer.masks.length > 1 ? "s" : ""}` : "",
                t && t.ms > 0 ? ` \xB7 ${t.ms.toFixed(0)} ms` : ""
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "row-ops", onClick: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { title: "Move up", disabled: i === 0, onClick: () => onMove(layer.id, -1), children: "\u2191" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { title: "Move down", disabled: i === count - 1, onClick: () => onMove(layer.id, 1), children: "\u2193" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { title: "Duplicate", onClick: () => onDuplicate(layer.id), children: "\u29C9" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { title: "Delete", onClick: () => onRemove(layer.id), children: "\u2715" })
            ] })
          ]
        },
        layer.id
      );
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "layerstack", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "panel-heading", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "Layer stack" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "Top runs first. Height builds the land, satmaps colour it." })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "add-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "select",
        {
          value: "",
          onChange: (e) => {
            if (e.target.value) onAdd(e.target.value);
            e.target.value = "";
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "+ Add layer\u2026" }),
            addGroups.map(([g, items]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("optgroup", { label: g, children: items.map(([v, l]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: v, children: l }, v)) }, g))
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "layer-list", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "group-caption", children: "Height" }),
        height.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "empty", children: "No height layers. Add a base shape." }),
        height.map((l, i) => row(l, i, height.length)),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "group-caption", children: "Satmap" }),
        satmap2.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "empty", children: "No satmap layers. Add one to colour the terrain." }),
        satmap2.map((l, i) => row(l, i, satmap2.length))
      ] })
    ] });
  }
  function Viewport({ result, dim, viewMode, sun }) {
    const canvasRef = (0, import_react2.useRef)(null);
    const camRef = (0, import_react2.useRef)({ x: 0.5, y: 0.92, height: 260, angle: Math.PI, fov: 62, horizon: 0.42 });
    const [, bump] = (0, import_react2.useState)(0);
    const dragRef = (0, import_react2.useRef)(null);
    (0, import_react2.useEffect)(() => {
      if (!result || !canvasRef.current) return;
      const cv = canvasRef.current;
      if (dim === "2d") {
        cv.width = result.N;
        cv.height = result.N;
        const data = renderView(result, viewMode, sun);
        cv.getContext("2d").putImageData(new ImageData(data, result.N, result.N), 0, 0);
      } else {
        const w = 960;
        const h = 540;
        cv.width = w;
        cv.height = h;
        const data = renderVoxel(result, sun, camRef.current, w, h);
        cv.getContext("2d").putImageData(new ImageData(data, w, h), 0, 0);
      }
    });
    const onDown = (e) => {
      dragRef.current = { x: e.clientX, y: e.clientY, angle: camRef.current.angle };
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragRef.current) return;
      camRef.current = { ...camRef.current, angle: dragRef.current.angle - (e.clientX - dragRef.current.x) * 8e-3 };
      camRef.current.horizon = Math.min(0.7, Math.max(0.2, camRef.current.horizon + (e.clientY - dragRef.current.y) * 1e-3));
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      dragRef.current.angle = camRef.current.angle;
      bump((n) => n + 1);
    };
    const onWheel = (e) => {
      camRef.current = { ...camRef.current, height: Math.max(20, camRef.current.height * (e.deltaY > 0 ? 1.1 : 0.9)) };
      bump((n) => n + 1);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "viewport", children: [
      !result && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "viewport-empty", children: "Evaluating terrain\u2026" }),
      dim === "2d" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("canvas", { ref: canvasRef, className: "terrain-canvas" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "canvas",
        {
          ref: canvasRef,
          className: "terrain-canvas perspective",
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: () => dragRef.current = null,
          onWheel,
          title: "Drag to orbit and tilt. Scroll to change camera height."
        }
      )
    ] });
  }
  function Inspector({ doc: doc2, layer, result, commit, setParam, updateLayer, changeType, addMask, updateMask, removeMask, changeMaskType, viewMode, setViewMode }) {
    if (!layer) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "inspector", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "panel-heading", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: doc2.name }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "Select a layer to inspect it. Terrain and light are below." })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Card, { caption: "Terrain", title: "Scale and relief", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            ParamForm,
            {
              schema: TERRAIN_PARAMS,
              values: doc2.terrain,
              onChange: (k, v) => commit((d) => ({ ...d, terrain: { ...d.terrain, [k]: v } }), `terrain.${k}`)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "card-note", children: "Sea level is in metres above the datum. Coastal masks and island generators key off it." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Card, { caption: "Light", title: "Sun", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            ParamForm,
            {
              schema: SUN_PARAMS,
              values: doc2.sun,
              onChange: (k, v) => commit((d) => ({ ...d, sun: { ...d.sun, [k]: v } }), `sun.${k}`)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "card-note", children: "The sun shades the relief and drives sun-exposure satmaps." })
        ] }),
        result && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { caption: "Readout", title: "Terrain", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "metrics", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Min" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("b", { children: [
              result.stats.minM.toFixed(0),
              " m"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Max" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("b", { children: [
              result.stats.maxM.toFixed(0),
              " m"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Mean" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("b", { children: [
              result.stats.meanM.toFixed(0),
              " m"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Sediment" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("b", { children: [
              result.stats.sedM.toFixed(2),
              " m"
            ] })
          ] })
        ] }) })
      ] });
    }
    const info = layerInfo(layer.type);
    const isSatmap = layer.kind === "satmap";
    const timing = result?.stats?.layers?.find((x) => x.id === layer.id);
    const errs = result?.stats?.errors?.filter((e) => e.id === layer.id) || [];
    const groups = isSatmap ? [["Satmap", [["satmap", SATMAP_TYPE.label]]]] : HEIGHT_GROUPS;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "inspector", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "panel-heading", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "kicker", children: CATEGORY_NAME[info.category] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "name-input", value: layer.name, onChange: (e) => updateLayer(layer.id, { name: e.target.value }, `${layer.id}.name`) })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Card, { caption: "Type", title: info.label, note: info.blurb, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Select,
          {
            label: "Layer type",
            value: layer.type,
            grouped: isSatmap ? groups : HEIGHT_GROUPS.map(([g, items]) => [g, items]),
            onChange: (t) => changeType(layer.id, t)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Toggle, { label: "Enabled", checked: layer.enabled !== false, onChange: (v) => updateLayer(layer.id, { enabled: v }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { caption: "Source", title: isSatmap ? "Colour source" : "Parameters", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        ParamForm,
        {
          schema: info.params,
          values: layer.params,
          onChange: (k, v) => setParam(layer.id, k, v)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Card, { caption: "Blend", title: "Output", children: [
        !isSatmap && info.category === "generator" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Select,
          {
            label: "Combine with layers below",
            value: layer.blend || "replace",
            options: BLEND_HEIGHT,
            onChange: (v) => updateLayer(layer.id, { blend: v }, `${layer.id}.blend`)
          }
        ),
        isSatmap && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Select,
          {
            label: "Blend mode",
            value: layer.params.blend || "over",
            options: BLEND_MODES,
            onChange: (v) => setParam(layer.id, "blend", v)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Slider,
          {
            def: { label: "Opacity", min: 0, max: 1, step: 0.01, def: 1, unit: "\xD7" },
            value: layer.opacity ?? 1,
            onChange: (v) => updateLayer(layer.id, { opacity: v }, `${layer.id}.opacity`)
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Card, { caption: "Masks", title: "Where this layer acts", note: "Masks multiply the layer's effect. Several masks combine with each mask's operator. No mask means everywhere.", children: [
        layer.masks.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "empty", children: "No masks. The layer applies everywhere." }),
        layer.masks.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          MaskCard,
          {
            mask: m,
            onType: (t) => changeMaskType(layer.id, m.id, t),
            onPatch: (patch, key) => updateMask(layer.id, m.id, patch, key),
            onParam: (k, v) => updateMask(layer.id, m.id, (mm) => ({ params: { ...mm.params, [k]: v } }), `${m.id}.${k}`),
            onRemove: () => removeMask(layer.id, m.id)
          },
          m.id
        )),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "add-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "select",
          {
            value: "",
            onChange: (e) => {
              if (e.target.value) addMask(layer.id, e.target.value);
              e.target.value = "";
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "+ Add mask\u2026" }),
              MASK_LIST.map(([k, l]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: k, children: l }, k))
            ]
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Card, { caption: "Output", title: "Layer readout", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "metrics", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Time" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: timing ? `${timing.ms.toFixed(0)} ms` : "\u2014" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Cached" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: timing?.cached ? "yes" : "no" })
          ] })
        ] }),
        errs.map((e, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "err", children: e.message }, i)),
        viewMode === "mask" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "card-note", children: "The viewport is showing this layer's combined mask." }),
        !isSatmap && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "wide", onClick: () => setViewMode("mask"), children: "Show this layer's mask in the viewport" })
      ] })
    ] }, layer.id);
  }
  function MaskCard({ mask, onType, onPatch, onParam, onRemove }) {
    const def = MASKS[mask.type];
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `mask-card ${mask.enabled === false ? "off" : ""}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mask-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { value: mask.type, options: MASK_LIST, onChange: onType }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { title: "Remove mask", onClick: onRemove, children: "\u2715" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mask-toggles", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Toggle, { label: "On", checked: mask.enabled !== false, onChange: (v) => onPatch({ enabled: v }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Toggle, { label: "Invert", checked: !!mask.invert, onChange: (v) => onPatch({ invert: v }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Select, { label: "Combine", value: mask.op || "multiply", options: MASK_OPS, onChange: (v) => onPatch({ op: v }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Slider,
        {
          def: { label: "Strength", min: 0, max: 1, step: 0.01, def: 1, unit: "\xD7" },
          value: mask.strength ?? 1,
          onChange: (v) => onPatch({ strength: v }, `${mask.id}.strength`)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "card-note", children: def?.blurb }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ParamForm, { schema: def.params, values: mask.params, onChange: onParam })
    ] });
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2e3);
  }
  (0, import_client.createRoot)(document.getElementById("root")).render(/* @__PURE__ */ (0, import_jsx_runtime2.jsx)(App, {}));
})();
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

scheduler/cjs/scheduler.production.min.js:
  (**
   * @license React
   * scheduler.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.production.min.js:
  (**
   * @license React
   * react-dom.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.production.min.js:
  (**
   * @license React
   * react-jsx-runtime.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
