<template>
  <div>
    <b-navbar toggleable="lg" type="dark" :variant="'primary'">
      <b-navbar-brand href="#">
        <span v-if="user?.name">Hello, {{ user.name }}</span>
        <span v-else>Card Game Lobby</span>
      </b-navbar-brand>
      <b-navbar-nav class="ml-auto">
        <b-nav-item v-if="user?.name">
          <button class="logout-btn" @click="logout">
            Sign out
          </button>
        </b-nav-item>
        <b-nav-item v-else>
          <button class="login-btn" @click="login">
            <img class="icon"
              src="https://images.ctfassets.net/xz1dnu24egyd/3JZABhkTjUT76LCIclV7sH/17a92be9bce78c2adcc43e23aabb7ca1/gitlab-logo-500.svg"
              alt="GitLab Logo" />
            Sign in with GitLab
          </button>
        </b-nav-item>
      </b-navbar-nav>
    </b-navbar>
  </div>
  <div v-if="user?.name" class="lobby">
    <div>
      <button class="create-game-btn" @click="showModal = true">Create New Game</button>
      <div class="game-card" v-for="(game, index) in games" :key="index">
        <h2>Room: {{ game.config.roomName }}</h2>
        <p>Capacity: {{ game.config.capacity }}</p>
        <p>Current Player Number: {{ game.playerNames.length }}</p>
        <p>Phase: {{ game.phase }}</p>
        <!-- <p>Play id: {{ game._id ? game._id.toString() : index}}</p> -->
        <ul>
          <li v-for="playerName in game.playerNames" :key="playerName">
            {{ playerName }}
          </li>
        </ul>
        <button v-if="game.playerNames.length < game.config.capacity" @click="joinGame(game._id)">Join Game</button>
        &nbsp &nbsp
        <button v-if=user.admin @click="viewAll(game._id)">View All</button>

      </div>
      <div>
        <b-modal v-model="showModal" body-class="position-static" hide-footer title="Create New Game">
          <b-overlay :show="isLoading" rounded="sm">
            <form>
              <b-form-group label="Game Name" label-for="gameName-input">
                <b-form-input id="gameName-input" :number="true" v-model="config.roomName" required></b-form-input>
              </b-form-group>
              <b-form-group label="Capacity" label-for="capacity-input">
                <b-form-input id="capacity-input" :number="true" v-model="config.capacity" required></b-form-input>
              </b-form-group>
              <b-form-group label="Number of Deck" label-for="numOfDeck-input">
                <b-form-input id="numOfDeck-input" :number="true" v-model="config.numberOfDecks" required></b-form-input>
              </b-form-group>
              <b-form-group label="Rank Limit" label-for="rankLimit-input">
                <b-form-input id="rankLimit-input" :number="true" v-model="config.rankLimit" required></b-form-input>
              </b-form-group>
            </form>
            <b-button @click="showModal = false">
              Cancel
            </b-button>
            &nbsp
            <b-button @click="createGame">
              Submit
            </b-button>
          </b-overlay>
        </b-modal>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, Ref, onMounted } from 'vue';
import { io } from "socket.io-client";
import { useRouter } from 'vue-router';
import { User, Config, GameState } from "../model"

const defaultConfig: Config = {
  roomName: 'New Game',
  capacity: 2,
  numberOfDecks: 2,
  rankLimit: 13,
};

const router = useRouter();
const socket = io({ transports: ["websocket"] });
const games: Ref<GameState[]> = ref([]);
const isLoading = ref(true);
const user = ref<User>();
const showModal = ref(false);
const config = ref<Config>(defaultConfig);

onMounted(async () => {
  try {
    const response = await fetch('/auth/get-user');
    if (response.ok) {
      user.value = await response.json()
    } else if (response.status === 401) {
      alert('Please login first');
    } else {
      console.error('Login failed with status:', response.status);
    }
  } catch (error) {
    console.error('Error during login:', error);
  }
});

socket.on('connect', () => {
  socket.emit('lobby-info');
});

socket.on('lobby-update', (updatedGames) => {
  games.value = updatedGames;
  console.log(updatedGames)
  isLoading.value = false;
});

socket.on('navigate', (gameId) => {
  const path = `/${gameId}`;
  router.push({ path });
});

const joinGame = (gameId: any) => {
  socket.emit('join-game', gameId);
};

socket.on('error', (msg) => {
  alert(msg);
  isLoading.value = false
});

async function createGame() {
  isLoading.value = true
  //fakee user
  socket.emit("new-game", config.value)
  showModal.value = false
}

function login() {
  window.location.href = '/auth/login'
}

function viewAll(gameId: any) {
  window.open('/' + gameId + '/all', '_blank')
}

async function logout() {
  try {
    const response = await fetch('/auth/logout', { method: 'POST', });

    if (response.ok) {
      console.log('Logged out successfully')
      window.location.href = '/'
    } else {
      console.error('Logout failed with status:', response.status);
    }
  } catch (error) {
    console.error('Error during logout:', error);
  }
}
</script>

<style scoped>
.lobby {
  max-width: 50rem;
  margin: 0 auto;
  padding: 1.25rem;
}

.loading {
  display: flex;
  justify-content: center;
}

.spinner {
  border: 0.375rem solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 0.375rem solid #3498db;
  width: 2.5rem;
  height: 2.5rem;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.game-card {
  border: 0.0625rem solid #ddd;
  padding: 0.9375rem;
  border-radius: 0.5rem;
  margin-bottom: 0.625rem;
  background-color: #f9f9f9;
}

button {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.625rem 0.9375rem;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: background-color 0.3s;
}

button:hover {
  background-color: #2980b9;
}

.create-game-btn {
  width: 100%;
  box-sizing: border-box;
}

.login-btn {
  background-color: white;
  color: #fca326;
  border: 0.08rem solid #fca326;
  padding: 0.8rem 1.5rem;
  border-radius: 1.5rem;
  font-size: 1rem;
  cursor: pointer;
  outline: none;
  transition: all 0.3s;
  box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.2);
  font-weight: bold;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.login-btn .icon {
  width: 1.5rem;
  height: 1.5rem;
  margin-right: 0.625rem;
}

.login-btn:hover,
.login-btn:focus {
  background-color: #fca326;
  color: white;
}

.logout-btn {
  background-color: #F6F8FA;
  color: #333;
  border: 1px solid #ccc;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s ease;
  text-align: center;
  display: inline-block;
  text-decoration: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  outline: none;
}

.logout-btn:hover,
.logout-btn:focus {
  background-color: #e1e4e8;
  border-color: #adb5bd;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.logout-btn:active {
  background-color: #d1d5da;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
}
</style>
