import { loadCloudDomain, saveCloudDomain } from "@/services/supabase";

export type WorkbenchLog = Record<string, unknown> & { id: string };

export async function loadWorkbenchLogs<T extends WorkbenchLog>(domain: "image-workbench" | "video-workbench") {
    return loadCloudDomain<T[]>(domain, []);
}

export async function saveWorkbenchLog<T extends WorkbenchLog>(domain: "image-workbench" | "video-workbench", log: T) {
    const logs = await loadWorkbenchLogs<T>(domain);
    await saveCloudDomain(domain, [log, ...logs.filter((item) => item.id !== log.id)]);
}

export async function deleteWorkbenchLogs(domain: "image-workbench" | "video-workbench", ids: string[]) {
    const removed = new Set(ids);
    const logs = await loadWorkbenchLogs<WorkbenchLog>(domain);
    await saveCloudDomain(domain, logs.filter((log) => !removed.has(log.id)));
}
