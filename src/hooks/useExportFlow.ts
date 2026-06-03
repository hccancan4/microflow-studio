/**
 * useExportFlow — dışa aktarma akışı (SVG / GDS-II / PNG) ve dialog durumu.
 * PNG için offscreen Konva render job'ı (exportJob) yönetir.
 * Davranış App.tsx'ten birebir taşındı.
 */
import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDesignStore } from '../stores/useDesignStore';
import { useProjectStore } from '../stores/useProjectStore';
import { exportDesignAsSvg } from '../utils/svgExporter';
import { buildGdsPolygons } from '../utils/gdsGeometry';
import { toast } from '../stores/useUiStore';
import type { ExportSettings } from '../components/ExportDialog';
import type { ExportJob } from '../utils/exportRenderer';
import type { ChipComponent, Connection } from '../types';

export function useExportFlow(components: ChipComponent[], connections: Connection[]) {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  // Aktif PNG render job'ı — null değilken ExportRenderer monte olur
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);

  const handleExport = useCallback(() => {
    if (useDesignStore.getState().components.length === 0) {
      toast.warn("Dışa aktarmak için canvas'a bileşen ekleyin.");
      return;
    }
    setExportDialogOpen(true);
  }, []);

  /** ExportDialog "Dışa Aktar" butonundan çağrılır. */
  const handleExportConfirm = useCallback(async (settings: ExportSettings) => {
    setExportBusy(true);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const ext = settings.format;
      const path = await save({
        filters: [{
          name: ext === 'png' ? 'PNG Görüntü' : 'SVG Vektör',
          extensions: [ext],
        }],
        defaultPath: `${useProjectStore.getState().metadata.name}.${ext}`,
      });
      if (!path) { setExportBusy(false); return; }

      if (settings.format === 'svg') {
        const svg = exportDesignAsSvg(components, connections, {
          background: settings.background,
          includeScaleBar: settings.includeScaleBar,
          paddingUm: settings.paddingUm,
        });
        await invoke<void>('export_svg', { outputPath: path, svg });
        setExportBusy(false);
        setExportDialogOpen(false);
        toast.success(`SVG dışa aktarıldı: ${path}`);
        return;
      }

      if (settings.format === 'gds') {
        const polygons = buildGdsPolygons(components, {
          arcResolution: settings.arcResolution,
        });
        if (polygons.length === 0) {
          throw new Error('Dışa aktarılacak poligon yok.');
        }
        const size = await invoke<number>('export_gds_file', {
          outputPath: path,
          polygons,
          params: {
            db_unit_um: 0.001,
            struct_name: useProjectStore.getState().metadata.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 31) || 'CHIP',
            lib_name: 'MICROFLOW',
          },
        });
        setExportBusy(false);
        setExportDialogOpen(false);
        toast.success(`GDS-II dışa aktarıldı (${polygons.length} poligon, ${size} bayt): ${path}`);
        return;
      }

      // PNG: offscreen Konva Stage → base64 → backend save
      const dataUrl = await new Promise<string>((resolve, reject) => {
        setExportJob({
          components,
          connections,
          options: {
            dpi: settings.dpi,
            background: settings.background,
            includeScaleBar: settings.includeScaleBar,
            paddingUm: settings.paddingUm,
          },
          resolve, reject,
        });
      });
      setExportJob(null);

      const [w, h] = await invoke<[number, number]>('export_png_data', {
        outputPath: path,
        data: dataUrl,
        options: {
          format: 'png',
          dpi: settings.dpi,
          background: settings.background,
          include_scale_bar: settings.includeScaleBar,
        },
      });
      setExportBusy(false);
      setExportDialogOpen(false);
      toast.success(`PNG dışa aktarıldı (${w}×${h}): ${path}`);
    } catch (err) {
      setExportJob(null);
      setExportBusy(false);
      toast.error(`Dışa aktarma hatası: ${err}`);
    }
  }, [components, connections]);

  return { exportDialogOpen, setExportDialogOpen, exportBusy, exportJob, handleExport, handleExportConfirm };
}
