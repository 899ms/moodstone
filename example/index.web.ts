import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { registerRootComponent } from "expo";

// On web, Skia draws through CanvasKit (WebAssembly), which has to load before anything imports Skia, so the app is
// imported only once it's ready. `setup-skia-web` copies canvaskit.wasm into public/, which is served from the site
// root; left to itself, CanvasKit would look for it next to the JS bundle instead.
void LoadSkiaWeb({ locateFile: (file) => `/${file}` }).then(async () => {
  const { default: App } = await import("./App");
  registerRootComponent(App);
});
