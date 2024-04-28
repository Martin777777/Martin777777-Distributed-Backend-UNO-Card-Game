import {ObjectId} from 'mongodb';
////////////////////////////////////////////////////////////////////////////////////////////
// data model for cards and game state

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Wild", "Skip", "Draw 2"]
export const SUITS = ["♦️", "♥️", "♣️", "♠️"]

export type CardId = string
export type LocationType = "unused" | "last-card-played" | "player-hand"

export interface Card {
  id: CardId
  rank: typeof RANKS[number]
  suit: typeof SUITS[number]
  locationType: LocationType
  playerIndex: number | null
  positionInLocation: number | null
}



export interface User {
  name: string;
  email: string;
  gameid: ObjectId | null;
  role: string;
  admin: boolean;
}

/**
 * determines whether one can play a card given the last card played
 */
export function areCompatible(card: Card, lastCardPlayed: Card) {
  return card.rank === lastCardPlayed.rank || card.suit === lastCardPlayed.suit || card.rank === "Wild" || lastCardPlayed.rank === "Wild"
}

export type GamePhase = "initial-card-dealing" | "play" | "game-over"



export interface Config {
  numberOfDecks: number
  rankLimit: number
  capacity: number
  roomName: string
}

export interface GameState {
  playerNames: string[]
  cardsById: Record<CardId, Card>
  currentTurnPlayerIndex: number
  phase: GamePhase
  playCount: number
  fewCardPlayer: number[]
  config: Config
  _id?: ObjectId
  version: number
  viewer?: string[]
}

export interface DrawCardAction {
  action: "draw-card"
  playerIndex: number
}

export interface PlayCardAction {
  action: "play-card"
  playerIndex: number
  cardId: CardId
}

export type Action = DrawCardAction | PlayCardAction
