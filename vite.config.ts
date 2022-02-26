/*
 * @description:
 * @author: xiangrong.liu
 * @Date: 2021-12-09 14:56:24
 * @LastEditors: xiangrong.liu
 * @LastEditTime: 2022-02-26 07:27:41
 */
import { UserConfigExport, ConfigEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteVConsole } from 'vite-plugin-vconsole';
import { resolve } from 'path';
import eslintPlugin from 'vite-plugin-eslint';
import legacy from '@vitejs/plugin-legacy';
import devServer from './build/devServer';
import legacyConf from './build/legacyConf';
import styleImport from 'vite-plugin-style-import';
import { visualizer } from 'rollup-plugin-visualizer';
export default ({ mode }: ConfigEnv): UserConfigExport => {
  console.log(resolve(__dirname, './src/main.ts'), mode);
  return {
    resolve: {
      alias: [{ find: '@', replacement: resolve(__dirname, './src') }],
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@import "@/styles/reset.scss";@import "@/styles/variables.scss";`
        }
      }
    },
    // base属性相当于webpack的publicPath属性。配置cdn的时候需要用到
    base: mode !== 'dev' ? '/hyth5/' : '/',
    plugins: [
      vue(),
      styleImport({
        libs: [
          {
            libraryName: 'vant',
            esModule: true,
            resolveStyle: (name) => `vant/es/${name}/style`
          }
        ]
      }),
      viteVConsole({
        entry: resolve(__dirname, './src/main.ts').replace(/\\/g, '/'), // entry file
        localEnabled: mode !== 'prod', // dev environment
        enabled: mode !== 'prod', // build production
        config: {
          // vconsole options
          maxLogNumber: 1000,
          theme: 'light'
        }
      }),
      // eslintPlugin({ cache: false }),
      legacy({
        targets: ['defaults', 'not IE 11']
      }),
      visualizer()
      // viteExternalsPlugin({
      //   echarts: 'echarts'
      // })
    ],
    // optimizeDeps: {
    //   include: ['vant/es']
    // },
    server: devServer,
    build: {
      target: 'es2015',
      outDir: './dist/',
      cssCodeSplit: true,
      // sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            echarts: ['echarts']
          }
        }
      }
      // minify: false
    }
  };
};
