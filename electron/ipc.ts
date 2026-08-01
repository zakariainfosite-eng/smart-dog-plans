import { ipcMain, protocol, type App } from "electron";

import { clearAuthSession, readAuthSession, writeAuthSession } from "./auth-session";
import * as agentsStore from "./agents-store";
import type { CreateAgentInput, UpdateAgentInput } from "./agents-store";
import * as checkpointsStore from "./checkpoints-store";
import type { CreateCheckpointInput, UpdateCheckpointInput } from "./checkpoints-store";
import { getDatabase, initializeDatabase } from "./database";
import * as dogsStore from "./dogs-store";
import type { CreateDogInput, UpdateDogInput } from "./dogs-store";
import { saveExportFiles, type SaveExportFilesRequest } from "./export-files";
import { getMediaAbsolutePath, readMediaFile, removeMediaFiles, saveMediaFile } from "./media-store";
import { executeRestQuery } from "./rest-gateway";
import type { RestQueryRequest } from "../src/integrations/database/rest-query-types";
import * as sectionsStore from "./sections-store";
import type { CreateSectionInput, UpdateSectionInput } from "./sections-store";
import { findUserById, seedLocalAuthUserFromEnv, verifyUserCredentials } from "./users-store";

/** Idempotent registration — safe if bootstrap is ever called twice. */
function handle(
  channel: string,
  listener: Parameters<typeof ipcMain.handle>[1],
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
}

export function registerIpcHandlers(app: App): void {
  // SQLite REST gateway — required by renderer `cynoplanning.rest.query`
  // (daily planning, exclusions, dashboard planning card, etc.).
  // Register first so a later handler failure cannot leave this channel missing.
  handle("db:restQuery", (_event, request: RestQueryRequest) => {
    initializeDatabase(app);
    return executeRestQuery(getDatabase(), request);
  });

  handle("auth:signIn", (_event, email: string, password: string) => {
    initializeDatabase(app);
    // Re-run seed before login so an empty users table (missed bootstrap env) self-heals.
    seedLocalAuthUserFromEnv(getDatabase());
    const user = verifyUserCredentials(getDatabase(), email, password);
    return writeAuthSession(app, user);
  });

  handle("auth:signOut", () => {
    clearAuthSession(app);
  });

  handle("auth:getSession", () => {
    initializeDatabase(app);
    const session = readAuthSession(app);
    if (!session) return null;

    const user = findUserById(getDatabase(), session.user.id);
    if (!user) {
      clearAuthSession(app);
      return null;
    }

    return {
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      user,
    };
  });

  handle("db:getSections", () => {
    initializeDatabase(app);
    return sectionsStore.getSections(getDatabase());
  });

  handle("db:createSection", (_event, input: CreateSectionInput) => {
    initializeDatabase(app);
    return sectionsStore.createSection(getDatabase(), input);
  });

  handle("db:updateSection", (_event, id: string, input: UpdateSectionInput) => {
    initializeDatabase(app);
    return sectionsStore.updateSection(getDatabase(), id, input);
  });

  handle("db:deleteSection", (_event, id: string) => {
    initializeDatabase(app);
    sectionsStore.deleteSection(getDatabase(), id);
  });

  handle("db:getAgents", () => {
    initializeDatabase(app);
    return agentsStore.getAgents(getDatabase());
  });

  handle("db:getAgent", (_event, id: string) => {
    initializeDatabase(app);
    return agentsStore.getAgent(getDatabase(), id);
  });

  handle("db:createAgent", (_event, input: CreateAgentInput) => {
    initializeDatabase(app);
    return agentsStore.createAgent(getDatabase(), input);
  });

  handle("db:updateAgent", (_event, id: string, input: UpdateAgentInput) => {
    initializeDatabase(app);
    return agentsStore.updateAgent(getDatabase(), id, input);
  });

  handle("db:deleteAgent", (_event, id: string) => {
    initializeDatabase(app);
    agentsStore.deleteAgent(getDatabase(), id);
  });

  handle("db:getDogs", () => {
    initializeDatabase(app);
    return dogsStore.getDogs(getDatabase());
  });

  handle("db:getDog", (_event, id: string) => {
    initializeDatabase(app);
    return dogsStore.getDog(getDatabase(), id);
  });

  handle("db:createDog", (_event, input: CreateDogInput) => {
    initializeDatabase(app);
    return dogsStore.createDog(getDatabase(), input);
  });

  handle("db:updateDog", (_event, id: string, input: UpdateDogInput) => {
    initializeDatabase(app);
    return dogsStore.updateDog(getDatabase(), id, input);
  });

  handle("db:deleteDog", (_event, id: string) => {
    initializeDatabase(app);
    dogsStore.deleteDog(getDatabase(), id);
  });

  handle("db:getCheckpoints", () => {
    initializeDatabase(app);
    return checkpointsStore.getCheckpoints(getDatabase());
  });

  handle("db:getCheckpoint", (_event, id: string) => {
    initializeDatabase(app);
    return checkpointsStore.getCheckpoint(getDatabase(), id);
  });

  handle("db:createCheckpoint", (_event, input: CreateCheckpointInput) => {
    initializeDatabase(app);
    return checkpointsStore.createCheckpoint(getDatabase(), input);
  });

  handle("db:updateCheckpoint", (_event, id: string, input: UpdateCheckpointInput) => {
    initializeDatabase(app);
    return checkpointsStore.updateCheckpoint(getDatabase(), id, input);
  });

  handle("db:deleteCheckpoint", (_event, id: string) => {
    initializeDatabase(app);
    checkpointsStore.deleteCheckpoint(getDatabase(), id);
  });

  // Planning export (PDF / Word / both) — single shared save dialog + filesystem write.
  handle("fs:saveExportFiles", (_event, request: SaveExportFilesRequest) =>
    saveExportFiles(app, request),
  );

  handle(
    "media:upload",
    (
      _event,
      request: { bucket: string; path: string; dataBase64: string; contentType?: string; upsert?: boolean },
    ) => saveMediaFile(app, request.bucket, request.path, request.dataBase64, request.upsert ?? false),
  );

  handle("media:remove", (_event, request: { bucket: string; paths: string[] }) =>
    removeMediaFiles(app, request.bucket, request.paths),
  );

  handle("media:download", (_event, request: { bucket: string; path: string }) => {
    const result = readMediaFile(app, request.bucket, request.path);
    if (result.error || !result.data) {
      return { data: null, error: result.error };
    }
    return {
      data: Buffer.from(result.data).toString("base64"),
      error: null,
    };
  });

  // ipcMain has no public list API — log the critical REST channel explicitly.
  console.log(
    "[electron][ipc] registered channels include: db:restQuery, fs:saveExportFiles, media:*, auth:*, db:get*/create*/update*/delete*",
  );
}

/** Register cynoplanning-media:// for local photo/attachment URLs. */
export function registerMediaProtocol(app: App): void {
  protocol.registerFileProtocol("cynoplanning-media", (request, callback) => {
    try {
      const raw = request.url.replace(/^cynoplanning-media:\/\//, "");
      const slash = raw.indexOf("/");
      if (slash <= 0) {
        callback({ error: -6 });
        return;
      }
      const bucket = decodeURIComponent(raw.slice(0, slash));
      const path = decodeURIComponent(raw.slice(slash + 1));
      callback({ path: getMediaAbsolutePath(app, bucket, path) });
    } catch {
      callback({ error: -6 });
    }
  });
}

/** Call after DB init to optionally seed a local admin from env. */
export function bootstrapLocalAuthSeed(app: App): void {
  initializeDatabase(app);
  seedLocalAuthUserFromEnv(getDatabase());
}
