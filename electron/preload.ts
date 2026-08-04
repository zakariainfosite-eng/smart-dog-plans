import { contextBridge, ipcRenderer } from "electron";

import type { CreateAgentInput, UpdateAgentInput } from "./agents-store";
import type { PersistedAuthSession } from "./auth-session";
import type { CreateCheckpointInput, UpdateCheckpointInput } from "./checkpoints-store";
import type { CreateDogInput, UpdateDogInput } from "./dogs-store";
import type { CreateSectionInput, UpdateSectionInput } from "./sections-store";
import type { RestQueryRequest, RestQueryResult } from "../src/integrations/database/rest-query-types";

console.log("[electron][preload] 6. BEFORE contextBridge.exposeInMainWorld");

contextBridge.exposeInMainWorld("cynoplanning", {
  auth: {
    signIn: (email: string, password: string): Promise<PersistedAuthSession> =>
      ipcRenderer.invoke("auth:signIn", email, password),
    signOut: (): Promise<void> => ipcRenderer.invoke("auth:signOut"),
    getSession: (): Promise<PersistedAuthSession | null> => ipcRenderer.invoke("auth:getSession"),
  },

  database: {
    getSections: () => ipcRenderer.invoke("db:getSections"),
    createSection: (input: CreateSectionInput) => ipcRenderer.invoke("db:createSection", input),
    updateSection: (id: string, input: UpdateSectionInput) =>
      ipcRenderer.invoke("db:updateSection", id, input),
    deleteSection: (id: string) => ipcRenderer.invoke("db:deleteSection", id),
    getAgents: () => ipcRenderer.invoke("db:getAgents"),
    getAgent: (id: string) => ipcRenderer.invoke("db:getAgent", id),
    createAgent: (input: CreateAgentInput) => ipcRenderer.invoke("db:createAgent", input),
    updateAgent: (id: string, input: UpdateAgentInput) =>
      ipcRenderer.invoke("db:updateAgent", id, input),
    deleteAgent: (id: string) => ipcRenderer.invoke("db:deleteAgent", id),
    getDogs: () => ipcRenderer.invoke("db:getDogs"),
    getDog: (id: string) => ipcRenderer.invoke("db:getDog", id),
    createDog: (input: CreateDogInput) => ipcRenderer.invoke("db:createDog", input),
    updateDog: (id: string, input: UpdateDogInput) =>
      ipcRenderer.invoke("db:updateDog", id, input),
    deleteDog: (id: string) => ipcRenderer.invoke("db:deleteDog", id),
    getCheckpoints: () => ipcRenderer.invoke("db:getCheckpoints"),
    getCheckpoint: (id: string) => ipcRenderer.invoke("db:getCheckpoint", id),
    createCheckpoint: (input: CreateCheckpointInput) =>
      ipcRenderer.invoke("db:createCheckpoint", input),
    updateCheckpoint: (id: string, input: UpdateCheckpointInput) =>
      ipcRenderer.invoke("db:updateCheckpoint", id, input),
    deleteCheckpoint: (id: string) => ipcRenderer.invoke("db:deleteCheckpoint", id),
  },

  rest: {
    query: (request: RestQueryRequest): Promise<RestQueryResult> =>
      ipcRenderer.invoke("db:restQuery", request),
    storageUpload: (request: {
      bucket: string;
      path: string;
      dataBase64: string;
      contentType?: string;
      upsert?: boolean;
    }) => ipcRenderer.invoke("media:upload", request),
    storageRemove: (request: { bucket: string; paths: string[] }) =>
      ipcRenderer.invoke("media:remove", request),
    storageDownload: (request: { bucket: string; path: string }) =>
      ipcRenderer.invoke("media:download", request),
  },

  files: {
    saveExportFiles: (request: {
      defaultBasename: string;
      files: Array<{
        filename: string;
        dataBase64?: string;
        data?: number[];
        byteLength?: number;
      }>;
    }): Promise<{ canceled: true } | { canceled: false; paths: string[] }> =>
      ipcRenderer.invoke("fs:saveExportFiles", request),
  },
});

console.log("[electron][preload] 6. AFTER contextBridge.exposeInMainWorld");
