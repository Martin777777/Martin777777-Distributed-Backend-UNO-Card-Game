import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { BootstrapVue, BootstrapVueIcons } from 'bootstrap-vue'
import axios from 'axios';

import 'bootstrap/dist/css/bootstrap.css'
import 'bootstrap-vue/dist/bootstrap-vue.css'

import App from './App.vue'
import Game from './views/Game.vue'
import Lobby from './views/Lobby.vue'

const routes = [
	{
		path: "/:gameId/:all?",
		component: Game,
		props (route: { params: { gameId: any; all: any;}; }) {
			return {
				gameId: route.params.gameId,
				all: route.params.all === 'all'
			}
		}
	},
	
	{ 
		path: "/", 
		component: Lobby
	},
]

const router = createRouter({
	history: createWebHistory(),
	routes,
})

axios.interceptors.response.use(response => {
    return response;
}, error => {
    if (error.response && error.response.status === 401) {
        router.push('/');
    }
    return Promise.reject(error);
});

createApp(App)
	.use(BootstrapVue as any)
	.use(BootstrapVueIcons as any)
	.use(router)
	.mount('#app')
