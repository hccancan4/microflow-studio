// ============================================================
// Deney verisi — içe aktarılan ölçüm veri setleri
// ============================================================

export interface ExperimentDataPoint {
  x: number;
  y: number;
  value: number;
  uncertainty?: number;
}

export interface ExperimentDataSet {
  id: string;
  name: string;
  filename: string;
  xColumn: string;
  yColumn: string;
  valueColumn: string;
  dataType: 'velocity' | 'pressure' | 'concentration';
  points: ExperimentDataPoint[];
  color: string;
}
