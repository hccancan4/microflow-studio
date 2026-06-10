/**
 * useProjectIO — proje dosya işlemleri: yeni / kaydet / farklı kaydet / aç.
 * Kaydedilmemiş değişiklik onayı (confirmAsync) ve toast bildirimleri dahil.
 * Davranış App.tsx'ten birebir taşındı.
 */
import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjectStore } from '../stores/useProjectStore';
import { useDesignStore } from '../stores/useDesignStore';
import { useSimulationStore } from '../stores/useSimulationStore';
import { useExperimentStore } from '../features/experiment/useExperimentStore';
import { useSweepStore } from '../features/sweep/useSweepStore';
import { toast, confirmAsync } from '../stores/useUiStore';
import type { RawMFlowProject } from '../types';

/** Kaydetme için proje payload'ı oluştur (Rust serde snake_case bekler). */
function buildProjectPayload() {
  const { metadata: md, scriptContent: sc } = useProjectStore.getState();
  const { components: comps, connections: conns, canvas: cv } = useDesignStore.getState();
  return {
    version: '1.0',
    metadata: md,
    canvas: cv,
    components: comps,
    connections: conns,
    simulation_results: null,
    experiment_data: useExperimentStore.getState().datasets,
    script: sc,
  };
}

export function useProjectIO() {
  const handleNewProjectStore = useProjectStore((s) => s.newProject);
  const reset = useSimulationStore((s) => s.reset);

  // isDirty closure'unu kullanmak yerine getState ile fresh oku
  const handleNewProject = useCallback(async () => {
    const dirty = useProjectStore.getState().isDirty;
    if (dirty) {
      const ok = await confirmAsync({
        title: 'Yeni Proje',
        message: 'Kaydedilmemiş değişiklikler var. Yeni projeye geçilsin mi?',
        confirmLabel: 'Devam et',
        danger: true,
      });
      if (!ok) return;
    }
    handleNewProjectStore();
    useDesignStore.getState().clearDesign();
    useExperimentStore.getState().clear();
    useSweepStore.getState().reset();
    reset();
  }, [handleNewProjectStore, reset]);

  const handleSave = useCallback(async () => {
    const { filePath, setFilePath: _setPath, setDirty: markClean } = useProjectStore.getState();
    if (!filePath) {
      handleSaveAs();
      return;
    }
    try {
      const project = buildProjectPayload();
      await invoke<void>('save_project_file', { project, path: filePath });
      markClean(false);
      toast.success('Proje kaydedildi');
    } catch (err) {
      toast.error(`Kaydetme hatası: ${err}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveAs = useCallback(async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        filters: [{ name: 'MicroFlow Proje', extensions: ['mflow'] }],
        defaultPath: `${useProjectStore.getState().metadata.name}.mflow`,
      });
      if (!path) return;
      const project = buildProjectPayload();
      await invoke<void>('save_project_file', { project, path });
      useProjectStore.getState().setFilePath(path);
      useProjectStore.getState().setDirty(false);
      useProjectStore.getState().addRecentFile(path);
      toast.success('Proje kaydedildi');
    } catch (err) {
      // Dialog import / save IPC hataları sessiz kalmasın
      console.error('[handleSaveAs]', err);
      toast.error(`Kaydetme hatası: ${err}`);
    }
  }, []);

  const handleOpen = useCallback(async () => {
    const dirty = useProjectStore.getState().isDirty;
    if (dirty) {
      const ok = await confirmAsync({
        title: 'Proje Aç',
        message: 'Kaydedilmemiş değişiklikler var. Başka bir proje açılsın mı?',
        confirmLabel: 'Aç',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const { open: openFile } = await import('@tauri-apps/plugin-dialog');
      const path = await openFile({
        filters: [{ name: 'MicroFlow Proje', extensions: ['mflow'] }],
      });
      if (!path) return;
      const project = await invoke<RawMFlowProject>('load_project_file', { path });
      useProjectStore.getState().setMetadata(project.metadata);
      useProjectStore.getState().setFilePath(path as string);
      useProjectStore.getState().setDirty(false);
      useProjectStore.getState().setScriptContent(project.script ?? '');
      useDesignStore.getState().loadDesign(project.components ?? [], project.connections ?? []);
      useExperimentStore.getState().replaceAll(project.experiment_data ?? []);
      useSweepStore.getState().reset();
      reset();
    } catch (_err) {
      // Dialog iptal edildi veya hata
    }
  }, [reset]);

  return { handleNewProject, handleSave, handleSaveAs, handleOpen };
}
