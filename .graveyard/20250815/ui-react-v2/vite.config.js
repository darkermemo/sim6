import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
// Bundle analysis plugin for development
const bundleAnalyzer = process.env.ANALYZE_BUNDLE === 'true'
    ? visualizer({
        filename: 'dist/bundle-analysis.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
    })
    : undefined;
// Sentry plugin for production builds
const sentryPlugin = process.env.NODE_ENV === 'production' && process.env.VITE_SENTRY_DSN
    ? sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
    })
    : undefined;
export default defineConfig(({ command, mode }) => ({
    // Set correct root directory
    root: __dirname,
    base: command === 'build' ? '/ui/v2/' : '/',
    plugins: [
        react(),
        bundleAnalyzer,
        sentryPlugin,
    ].filter(Boolean),
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    // Performance optimizations
    build: {
        // Code splitting configuration
        rollupOptions: {
            output: {
                manualChunks: {
                    // Vendor chunks
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-query': ['@tanstack/react-query'],
                    'vendor-table': ['@tanstack/react-table', '@tanstack/react-virtual'],
                    'vendor-charts': ['echarts', 'echarts-for-react'],
                    'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-select'],
                    // Feature chunks
                    'search-v4': ['./src/pages/SearchGoldenV4'],
                    'search-v3': ['./src/pages/SearchGoldenV3'],
                    'search-v2': ['./src/pages/SearchGoldenV2'],
                    'search-legacy': ['./src/pages/SearchGolden'],
                    'dashboard': ['./src/pages/DashboardGolden', './src/pages/Dashboard'],
                    'utils': ['./src/lib/http', './src/lib/api-golden'],
                },
            },
        },
        // Performance settings
        target: 'esnext',
        minify: 'esbuild',
        sourcemap: process.env.NODE_ENV === 'production',
        // Bundle size optimizations
        chunkSizeWarningLimit: 1000, // 1MB warning threshold
        // Asset optimization
        assetsInlineLimit: 4096, // 4KB inline threshold
    },
    // Development server optimizations
    server: {
        host: true,
        port: 5175,
        strictPort: true,
        hmr: {
            clientPort: 5175,
            overlay: true,
        },
    },
    preview: {
        host: true,
        port: 5175,
        strictPort: true,
    },
    // Production optimizations
    esbuild: {
        // Remove console logs in production
        drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    },
    // Define global constants
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
        __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
}));
