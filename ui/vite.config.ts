import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      vue: '@vue/compat',
    }
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          compatConfig: {
            MODE: 2
          }
        }
      }
    }),
  ],

	server: {
    host: "127.0.0.1",
		port: parseInt(process.env.UI_PORT || "8100"),
		proxy: {
			"^/socket.io": {
				target: `http://127.0.0.1:${process.env.SERVER_PORT || "8101"}`,
        ws: true,
			},
      "^/auth": {
				target: `http://127.0.0.1:${process.env.SERVER_PORT || "8101"}`,
			},
    }
	},
})


