// Client for the saved-views store (server/views_api.py on :8020). Its own base, not risk_api's /api.
// File ids are `Section/Folder/slug` with no `.json`.
import { apiGet, apiSend } from "./client";
import type { ViewTree, ViewDoc, ViewState } from "./types";

export const VIEWS_BASE = "/views-api";

// A file id / folder path is `/`-separated; encode each segment so '#', '?', '%' and spaces in a
// folder name survive the URL (the server's `{file:path}` route decodes percent-encoding).
const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export function listViews() {
  return apiGet<{ sections: Record<string, ViewTree> }>("/views", undefined, VIEWS_BASE);
}
export function loadView(file: string) {
  return apiGet<ViewDoc>(`/views/item/${encodePath(file)}`, undefined, VIEWS_BASE);
}
export function saveView(name: string, folder: string, state: ViewState) {
  return apiSend<{ file: string }>("PUT", "/views/save", { name, folder, state }, VIEWS_BASE);
}
export function deleteView(file: string) {
  return apiSend<{ deleted: string }>("DELETE", `/views/item/${encodePath(file)}`, undefined, VIEWS_BASE);
}
export function makeFolder(parent: string, name: string) {
  return apiSend<{ folder: string }>("POST", "/views/folder", { parent, name }, VIEWS_BASE);
}
