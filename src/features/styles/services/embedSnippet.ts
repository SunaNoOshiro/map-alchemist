type EmbedFeatures = {
  popup?: boolean;
  poiColorLabels?: boolean;
  demoPois?: boolean;
};

type EmbedConfig = {
  container?: string;
  styleUrl: string;
  runtimeUrl: string;
  features?: EmbedFeatures;
  mapOptions?: {
    center?: [number, number];
    zoom?: number;
  };
};

const DEFAULT_FEATURES: Required<EmbedFeatures> = {
  popup: true,
  poiColorLabels: true,
  demoPois: false
};

const normalizeFeatures = (features?: EmbedFeatures): Required<EmbedFeatures> => ({
  popup: features?.popup ?? DEFAULT_FEATURES.popup,
  poiColorLabels: features?.poiColorLabels ?? DEFAULT_FEATURES.poiColorLabels,
  demoPois: features?.demoPois ?? DEFAULT_FEATURES.demoPois
});

export const buildRuntimeUrlFromStyleUrl = (styleUrl: string): string => {
  try {
    const parsed = new URL(styleUrl);
    const styleSegment = '/styles/';
    const index = parsed.pathname.lastIndexOf(styleSegment);

    if (index >= 0) {
      parsed.pathname = `${parsed.pathname.slice(0, index)}/runtime/map-alchemist-runtime.js`;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    }

    const fallbackBase = parsed.pathname.slice(0, parsed.pathname.lastIndexOf('/'));
    parsed.pathname = `${fallbackBase}/runtime/map-alchemist-runtime.js`;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_error) {
    return 'https://example.com/runtime/map-alchemist-runtime.js';
  }
};

export const buildEmbedSnippet = (config: EmbedConfig): string => {
  const container = config.container || 'map';
  const initConfig: Record<string, unknown> = {
    container,
    styleUrl: config.styleUrl,
    features: normalizeFeatures(config.features)
  };

  if (config.mapOptions) {
    initConfig.mapOptions = config.mapOptions;
  }

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>MapAlchemist Embed</title>',
    '  <link href="https://unpkg.com/maplibre-gl@4.6.0/dist/maplibre-gl.css" rel="stylesheet" />',
    `  <style>html, body { margin: 0; padding: 0; height: 100%; } #${container} { width: 100%; height: 100%; }</style>`,
    '</head>',
    '<body>',
    `  <div id="${container}"></div>`,
    '  <script src="https://unpkg.com/maplibre-gl@4.6.0/dist/maplibre-gl.js"><\/script>',
    `  <script src="${config.runtimeUrl}"><\/script>`,
    '  <script>',
    `    MapAlchemistRuntime.init(${JSON.stringify(initConfig, null, 2)});`,
    '  <\/script>',
    '</body>',
    '</html>'
  ].join('\n');
};
