import { PlayerInfo } from "../types";

export class Player {
  id: string; // we use the socket id, so it's unique per browser tab
  name: string;
  score: number = 0;
  isReady: boolean = false;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  // The public version of this player that we send to clients
  toInfo(hostId: string | null): PlayerInfo {
    return {
      id: this.id,
      name: this.name,
      score: this.score,
      isReady: this.isReady,
      isHost: this.id === hostId,
    };
  }
}