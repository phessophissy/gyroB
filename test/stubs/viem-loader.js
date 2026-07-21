// Node ESM loader hook that redirects `viem` imports to a local stub
// so frontend/js/format.js can be unit-tested under Node without the
// real viem package or a bundler.
//
// Usage: node --import ./test/stubs/viem-loader.js --test test/format-helpers.test.js

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "viem") {
    return nextResolve("./test/stubs/viem-stub.js", context);
  }
  return nextResolve(specifier, context);
}
