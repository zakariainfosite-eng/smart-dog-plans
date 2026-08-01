import { getElectronDatabaseBridge } from "./electron-bridge";
import type { DatabaseProvider } from "./types";

export function createSqliteProvider(): DatabaseProvider {
  const bridge = getElectronDatabaseBridge();

  return {
    getSections: () => bridge.getSections(),
    createSection: (input) => bridge.createSection(input),
    updateSection: (id, input) => bridge.updateSection(id, input),
    deleteSection: (id) => bridge.deleteSection(id),
    getAgents: () => bridge.getAgents(),
    getAgent: (id) => bridge.getAgent(id),
    createAgent: (input) => bridge.createAgent(input),
    updateAgent: (id, input) => bridge.updateAgent(id, input),
    deleteAgent: (id) => bridge.deleteAgent(id),
    getDogs: () => bridge.getDogs(),
    getDog: (id) => bridge.getDog(id),
    createDog: (input) => bridge.createDog(input),
    updateDog: (id, input) => bridge.updateDog(id, input),
    deleteDog: (id) => bridge.deleteDog(id),
    getCheckpoints: () => bridge.getCheckpoints(),
    getCheckpoint: (id) => bridge.getCheckpoint(id),
    createCheckpoint: (input) => bridge.createCheckpoint(input),
    updateCheckpoint: (id, input) => bridge.updateCheckpoint(id, input),
    deleteCheckpoint: (id) => bridge.deleteCheckpoint(id),
  };
}
