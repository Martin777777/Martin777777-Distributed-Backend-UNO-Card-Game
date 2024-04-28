<template>
  <div
  v-if="card && card.locationType != 'unused'"
  :class="{
      'animated-card': true,
      'can-play': isCompatible,
      'last-played': card.locationType === 'last-card-played'
  }" @click="emit('play', card.id)">
      <span>{{ card.rank }}{{ card.suit }}{{ card.rank.length === 1 ? ' ' : '' }}</span>
      <span>{{ ' ' + card.locationType }} {{ card.playerIndex ?? '' }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Card, areCompatible } from "../model"

interface Props {
  card: Card,
  lastCardPlayed?: Card
}
const props = withDefaults(defineProps<Props>(), {
  card: undefined,
  lastCardPlayed: undefined,
})

const card = props.card
const lastCardPlayed = props.lastCardPlayed
// let content = ref("")
const isCompatible = computed(() => {
  if (card && lastCardPlayed && card.locationType!="last-card-played" && card.locationType!="unused") {
    return areCompatible(card, lastCardPlayed)
  }
  return false
})
const emit = defineEmits(['play'])
</script>

<style>
.animated-card {
    display: inline-flex; /* Use inline-flex for the cards */
    width: 6.25rem;
    height: 8.75rem;
    border-radius: 0.5rem;
    box-shadow: 0 0.25rem 0.5rem rgba(0,0,0,0.2);
    font-family: 'Times New Roman', serif;
    color: #212529;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: normal; /* Adjusted for flexbox */
    background-color: white;
    position: relative;
    margin: 0.5rem; /* Individual card margin */
}

/* Additional styling for the last card played */
.last-played {
    border: 0.125rem solid blue; /* 2px / 16px per rem */
}

/* Style for when the move is not allowed */
.can-play {
    border: 0.125rem solid lawngreen; /* 2px / 16px per rem */
}

/* Positioning the location and player index, if included */
.animated-card span:nth-child(2) {
    position: absolute;
    bottom: 0.3125rem; /* 5px / 16px per rem */
    right: 0.3125rem; /* 5px / 16px per rem */
    font-size: 0.625rem; /* 10px / 16px per rem */
    line-height: normal; /* Reset line-height for positioning */
}
</style>
