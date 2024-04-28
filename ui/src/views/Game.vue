<template>
  <div v-if="valid" :key="key">
    <div :key="key">

      <div class="controls-container mt-2">
        <button v-if="all" class="button-custom" @click="socket.emit('BackToLobby', gameId)"> Back to Lobby</button>
        <button v-if="!all && user?.admin" class="button-custom" @click="openWindow(gameId + '/all')">Cheat</button>
        <button v-if="!all" class="button-custom" :disabled="phase !== 'game-over'"
          @click="socket.emit('Leave', user?.name)"> Leave Game</button>
        <button v-if="!all" class="button-custom" :disabled="!isHost" @click="socket.emit('Reshuffle', user?.name)">
          Restart Game</button>
        <span v-if="!all" class="button-custom" @click="showModal = true"> Configure Game</span>
        <span :class="['badge-custom', myTurn ? 'badge-primary' : 'badge-secondary']">
          turn: {{ currentTurnPlayerIndex }}
        </span>
        <span class="badge-custom">
          Current Player Number: {{ currentPlayerCount }}/{{ currentConfig.capacity }}
        </span>
        <span class="badge-custom">Phase: {{ phase }}</span>
        <span class="badge-custom">User: {{ user?.name }}</span>
      </div>

      <div v-if="fewCardPlayer" class="alert alert-info mt-3">
        Players with no more than 2 cards left in their hands: <b>{{ fewCardPlayer.map(player => `Player${player +
          1}`).join(', ') }}</b>
      </div>
      <div class="cards-container">
        <AnimatedCard v-for="card in cards.filter(card => card.locationType !== 'last-card-played')" :card="card"
          :lastCardPlayed="lastCardPlayed" @play="playCard(card.id)" />
      </div>
      <hr>
      <div class="cards-container">
        <AnimatedCard v-if="cards.find(card => card.locationType === 'last-card-played')"
          :card="cards.find(card => card.locationType === 'last-card-played')" :lastCardPlayed="lastCardPlayed"
          @play="playCard" />
      </div>
      <div class="controls-container">
        <b-button v-if="!all" class="mx-2 my-2" size="sm" @click="drawCard" :disabled="!myTurn">Draw Card</b-button>
      </div>

      <b-modal v-model="showModal" @shown="loadConfig" body-class="position-static" hide-footer
        title="Change Configuration">
        <b-overlay :show="isLoading" rounded="sm">
          <form>
            <b-form-group label="Number of Deck" label-for="numOfDeck-input">
              <b-form-input id="numOfDeck-input" :number="true" v-model="currentConfig.numberOfDecks"
                required></b-form-input>
            </b-form-group>
            <b-form-group label="Rank Limit" label-for="rankLimit-input">
              <b-form-input id="rankLimit-input" :number="true" v-model="currentConfig.rankLimit" required></b-form-input>
            </b-form-group>
            <b-form-group label="Capacity" label-for="capacity-input">
              <b-form-input id="capacity-input" :number="true" v-model="currentConfig.capacity" required></b-form-input>
            </b-form-group>
            <b-form-group label="Room Name" label-for="roomName-input">
              <b-form-input id="roomName-input" :number="true" v-model="currentConfig.roomName" required></b-form-input>
            </b-form-group>
          </form>
          <b-button @click="showModal = false">
            Cancel
          </b-button>
          &nbsp
          <b-button :disabled="!isHost" @click="saveConfig">
            Save Changes
          </b-button>
        </b-overlay>
      </b-modal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, Ref, watchEffect, watch, onMounted } from 'vue'
import { io } from "socket.io-client"
import { Card, GamePhase, Action, CardId, Config, User } from "../model"
import AnimatedCard from '../components/AnimatedCard.vue'
import { useRouter } from 'vue-router';

// props
interface Props {
  gameId?: string
  all?: boolean
}

// default values for props
const props = withDefaults(defineProps<Props>(), {
  gameId: "all",
  boolean: "false"
})

let gameId = props.gameId
let all = props.all

const socket = io({ transports: ["websocket"] })
const user = ref<User>()
const isHost = ref(false)
let playerIndex: any = ref(null)

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
  joinServer()
});

async function joinServer() {
  if (user.value?.name) {
    if (all) {
      socket.emit("view-all", { gameId: gameId, name: user.value.name })
    } else {
      socket.emit("player-name");
    }
  }
}

function openWindow(url: string) {
  window.open(url, '_blank')
}

watch(() => user.value?.name, (newName) => {
  if (newName) {
    joinServer()
  }
}, {
  immediate: true,
});

watch(() => user?.value, (newUser) => {
  if (newUser && newUser.role == "host") {
    isHost.value = true
  }
}, {
  immediate: true,
});

const cards: Ref<Card[]> = ref([])
const currentTurnPlayerIndex = ref(-1)
const phase = ref("")
const playCount = ref(-1)
const myTurn = computed(() => currentTurnPlayerIndex.value === playerIndex && phase.value !== "game-over")
const lastCardPlayed = ref<Card>()
const fewCardPlayer = ref<number[]>([])
let key = ref(0)
const showModal = ref(false);
const isLoading = ref(false)
const valid = ref(true)
const currentPlayerCount = ref(0)
const defaultConfig: Config = {
  numberOfDecks: 1,
  rankLimit: 13,
  capacity: 4,
  roomName: 'Default Room',
};
const router = useRouter();
const currentConfig = ref<Config>(defaultConfig);
socket.on('error', (msg) => {
  alert(msg);
});

socket.on('leave', (msg) => {
  if (msg) {
    alert(msg)
  }
  const path = `/`;
  router.push({ path });
});

socket.on("validation", () => { valid.value = true })

socket.on("all-cards", (index: Number, allCards: Card[]) => {
  playerIndex = index
  cards.value = allCards
  applyUpdatedCards(allCards)
})

socket.on("updated-cards", (updatedCards: Card[]) => {
  applyUpdatedCards(updatedCards)
})

socket.on("game-state", (newCurrentTurnPlayerIndex: number, newPhase: GamePhase, newPlayCount: number, newPlayerCount: number, newConfig: Config, newfewCardPlayer?: number[]) => {
  currentTurnPlayerIndex.value = newCurrentTurnPlayerIndex
  phase.value = newPhase
  playCount.value = newPlayCount
  if (newfewCardPlayer) {
    fewCardPlayer.value = newfewCardPlayer
  }
  currentPlayerCount.value = newPlayerCount
  currentConfig.value = newConfig
})

watchEffect(() => {
  lastCardPlayed.value = cards.value.find(card => card.locationType === "last-card-played");
});

function doAction(action: Action) {
  return new Promise<Card[]>((resolve) => {
    socket.emit("action", action)
    socket.once("updated-cards", (updatedCards: Card[]) => {
      resolve(updatedCards)
    })
  })
}

async function drawCard() {
  if (typeof playerIndex === "number") {
    const updatedCards = await doAction({ action: "draw-card", playerIndex })
    if (updatedCards.length === 0) {
      alert("didn't work")
    }
  }
  key.value++
}

async function loadConfig() {
  return new Promise<void>((resolve) => {
    isLoading.value = true
    socket.emit("get-config")
    socket.once("get-config-reply", (config: Config) => {
      currentConfig.value = config
      isLoading.value = false
      resolve()
    })
  })
}

async function saveConfig() {
  return new Promise<void>(() => {
    isLoading.value = true
    socket.emit("update-config", currentConfig.value)
    socket.once("update-config-reply", (valid: boolean) => {
      isLoading.value = false
      if (!valid) {
        alert("argument is not valid, please enter again")
      } else {
        showModal.value = false
      }
    })
  })
}

async function playCard(cardId: CardId) {
  if(all){
    return
  }
  if (typeof playerIndex === "number") {
    const updatedCards = await doAction({ action: "play-card", playerIndex, cardId })
    if (updatedCards.length === 0) {
      alert("didn't work")
    }
  }
  key.value++
}

async function applyUpdatedCards(updatedCards: Card[]) {
  for (const x of updatedCards) {
    const existingCard = cards.value.find(y => x.id === y.id)
    if (existingCard) {
      Object.assign(existingCard, x)
    } else {
      cards.value.push(x)
    }
  }
  key.value++
}
</script>

<style scoped>
.cards-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  padding: 1rem;
}


.controls-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  padding: 10px;
}

.button-custom {
  margin: 8px;
  border: none;
  border-radius: 10px;
  padding: 5px 10px;
  color: white;
  background-color: #007BFF;
  cursor: pointer;
  transition: background-color 0.3s, transform 0.3s;
}

.button-custom:hover {
  background-color: #0056b3;
  transform: translateY(-2px);
}

.badge-custom {
  margin: 10px;
  padding: 5px 10px;
  color: white;
  border-radius: 10px;
  background-color: #6c757d;
}

.button-custom:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.badge-primary {
  background-color: #007bff;
}

.badge-secondary {
  background-color: #6c757d;
}
</style>
