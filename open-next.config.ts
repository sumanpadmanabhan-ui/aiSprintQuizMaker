import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
	...defineCloudflareConfig({
		// Uncomment to enable R2 cache,
		// It should be imported as:
		// `import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";`
		// See https://opennext.js.org/cloudflare/caching for more details
		// incrementalCache: r2IncrementalCache,
	}),
	// Workers Builds runs `npm run build`. That script is OpenNext, so OpenNext
	// must call Next directly or the build would recurse.
	buildCommand: "npx next build",
};
