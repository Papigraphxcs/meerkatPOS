import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
	base: "/meerkatpos/",
	plugins: [
		vue(),
		VitePWA({
			registerType: "autoUpdate",
			injectRegister: false,
			includeAssets: ["pwa-192x192.png", "pwa-512x512.png", "apple-touch-icon.png"],
			manifest: {
				name: "meerkatPOS - Point of Sale",
				short_name: "meerkatPOS",
				description: "Modern Point of Sale application with offline support",
				theme_color: "#171717",
				background_color: "#ffffff",
				display: "standalone",
				orientation: "any",
				scope: "/meerkatpos/",
				start_url: "/meerkatpos/",
				id: "/meerkatpos/",
				categories: ["business", "finance"],
				icons: [
					{
						src: "pwa-192x192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any maskable",
					},
				],
				screenshots: [
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
						form_factor: "wide",
						label: "meerkatPOS Dashboard",
					},
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
						form_factor: "narrow",
						label: "meerkatPOS Mobile",
					},
				],
			},
			devOptions: {
				enabled: false,
			},
			workbox: {
				globPatterns: ["**/*.{js,css,svg,png,ico,woff,woff2,ttf,eot}"],
				globIgnores: ["**/index.html"],
				modifyURLPrefix: { "": "/assets/xpos/meerkatpos/" },
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
				runtimeCaching: [
					{
						urlPattern: /^https?:\/\/[^/]+\/meerkatpos\/?$/,
						handler: "NetworkFirst",
						options: {
							cacheName: "meerkatpos-html-cache",
							expiration: {
								maxEntries: 5,
								maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
							},
							networkTimeoutSeconds: 3,
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /^https?:\/\/.*\/api\/method\//,
						handler: "NetworkFirst",
						method: "GET",
						options: {
							cacheName: "meerkatpos-api-cache",
							expiration: {
								maxEntries: 200,
								maxAgeSeconds: 60 * 60 * 24, // 24 hours
							},
							networkTimeoutSeconds: 5,
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /^https?:\/\/.*\/assets\//,
						handler: "CacheFirst",
						options: {
							cacheName: "meerkatpos-assets-cache",
							expiration: {
								maxEntries: 200,
								maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /^https?:\/\/.*\/files\//,
						handler: "CacheFirst",
						options: {
							cacheName: "meerkatpos-files-cache",
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
				],
			},
		}),
	],
	css: {
		postcss: "./postcss.config.js",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	server: {
		port: 5174,
		middlewareMode: false,
		proxy: {
			"/api": {
				target: "http://localhost:8000",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, "/api"),
				configure: (proxy) => {
					proxy.on("proxyReq", (_proxyReq, req) => {
						console.log("Request:", req.method, req.url);
					});
				},
			},
			"/method": {
				target: "http://localhost:8000",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/method/, "/method"),
			},
			"/assets": {
				target: "http://localhost:8000",
				changeOrigin: true,
			},
			"/files": {
				target: "http://localhost:8000",
				changeOrigin: true,
			},
			"/upload_file": {
				target: "http://localhost:8000",
				changeOrigin: true,
			},
			"/api/resource": {
				target: "http://localhost:8000",
				changeOrigin: true,
			},
			"/socket.io": {
				target: "http://localhost:9000",
				changeOrigin: true,
				ws: true,
				rewrite: (path) => path.replace(/^\/socket.io/, "/socket.io"),
			},
		},
	},
	optimizeDeps: {
		exclude: ["@vite/client", "@vite/env"],
	},
	build: {
		outDir: path.resolve(__dirname, "../xpos/public/meerkatpos"),
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			input: path.resolve(__dirname, "index.html"),
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) return;

					if (
						id.includes("node_modules/vue") ||
						id.includes("node_modules/vue-router") ||
						id.includes("node_modules/pinia")
					) {
						return "vendor-vue";
					}

					const parts = id.split("node_modules/")[1]?.split("/") || [];
					const pkgName = parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
					if (pkgName) return `vendor-${pkgName.replace("/", "-")}`;
				},
			},
		},
	},
});
