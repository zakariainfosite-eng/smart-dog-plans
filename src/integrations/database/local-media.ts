const IDB_NAME = "cynoplanning-media";
const IDB_STORE = "files";

function mediaKey(bucket: string, path: string): string {
  return `${bucket}/${path.replace(/^\/+/, "")}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveLocalMediaFile(
  bucket: string,
  path: string,
  dataBase64: string,
  upsert: boolean,
): Promise<{ error: { message: string } | null }> {
  try {
    const db = await openDb();
    const key = mediaKey(bucket, path);
    const existing = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const get = tx.objectStore(IDB_STORE).get(key);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    if (!upsert && existing != null) {
      db.close();
      return { error: { message: "The resource already exists" } };
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(dataBase64, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { error: null };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export async function removeLocalMediaFiles(
  bucket: string,
  paths: string[],
): Promise<{ error: { message: string } | null }> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      for (const path of paths) {
        tx.objectStore(IDB_STORE).delete(mediaKey(bucket, path));
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { error: null };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export async function readLocalMediaFile(
  bucket: string,
  path: string,
): Promise<{ data: string | null; error: { message: string } | null }> {
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const get = tx.objectStore(IDB_STORE).get(mediaKey(bucket, path));
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    if (typeof value !== "string") {
      return { data: null, error: { message: "Object not found" } };
    }
    return { data: value, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
