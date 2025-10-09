// Kanban Types

export const KanbanStatus = {
  BACKLOG: 'BACKLOG',
  FILES_TO_STUDIO: 'FILES_TO_STUDIO',
  REVISAO_TEXTO: 'REVISAO_TEXTO',
  REVIEW_DELL: 'REVIEW_DELL',
  FINAL_MATERIAL: 'FINAL_MATERIAL',
  ASSET_RELEASE: 'ASSET_RELEASE',
  COMPLETED: 'COMPLETED',
} as const;

export type KanbanStatus = typeof KanbanStatus[keyof typeof KanbanStatus];

export const VFType = {
  NO_VF: 'NO_VF',
  MICROSOFT_JMA_CS: 'MICROSOFT_JMA_CS',
  OTHER: 'OTHER',
} as const;

export type VFType = typeof VFType[keyof typeof VFType];

export const AssetType = {
  ESTATICO: 'ESTATICO',
  VIDEO: 'VIDEO',
  WIREFRAME: 'WIREFRAME',
  GIF: 'GIF',
  STORY: 'STORY',
  MOLDURA: 'MOLDURA',
  AW_STORY: 'AW_STORY',
  HTML: 'HTML',
  OTHER: 'OTHER',
} as const;

export type AssetType = typeof AssetType[keyof typeof AssetType];

export const WorkfrontFrente = {
  SOCIAL: 'SOCIAL',
  DISPLAY: 'DISPLAY',
  EMAIL: 'EMAIL',
  LANDING_PAGE: 'LANDING_PAGE',
  PRINT: 'PRINT',
  OTHER: 'OTHER',
} as const;

export type WorkfrontFrente = typeof WorkfrontFrente[keyof typeof WorkfrontFrente];

export const FiscalYear = {
  FY25: 'FY25',
  FY26: 'FY26',
  FY27: 'FY27',
  FY28: 'FY28',
} as const;

export type FiscalYear = typeof FiscalYear[keyof typeof FiscalYear];

export interface KanbanCard {
  id: string;
  bi: boolean;
  round?: number;
  anotacoes?: string;
  start?: string;
  realDeliv?: string;
  prevDeliv?: string;
  dsid?: string;
  atividade: string;
  status: KanbanStatus;
  studio?: string;
  vf?: VFType;
  tipoAsset: AssetType;
  numeroAssets: number;
  cliente?: string;
  brand?: string;
  week?: string;
  quarter?: string;
  frente: WorkfrontFrente;
  fy?: FiscalYear;
  
  // Datas de entregas e feedbacks
  entregaR1VML?: string;
  feedbackR1Dell?: string;
  entregaR2VML?: string;
  feedbackR2Dell?: string;
  entregaR3VML?: string;
  feedbackR3Dell?: string;
  entregaR4VML?: string;
  feedbackR4Dell?: string;
  
  // Campos calculados
  diasStartR1VML?: number;
  diasR1VMLR1Dell?: number;
  diasR1DellR2VML?: number;
  diasR2VMLR2Dell?: number;
  diasR2DellR3VML?: number;
  diasR3VMLR3Dell?: number;
  diasR3DellR4VML?: number;
  diasR4VMLR4Dell?: number;
  diasNaVMLPercent?: number;
  diasNaDellPercent?: number;
  
  // Posição no board
  position: number;
  columnId?: string;
  
  // Auditoria
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKanbanCardDto {
  bi?: boolean;
  round?: number;
  anotacoes?: string;
  start?: string;
  realDeliv?: string;
  prevDeliv?: string;
  dsid?: string;
  atividade: string;
  status?: KanbanStatus;
  studio?: string;
  vf?: VFType;
  tipoAsset?: AssetType;
  numeroAssets?: number;
  cliente?: string;
  brand?: string;
  week?: string;
  quarter?: string;
  frente?: WorkfrontFrente;
  fy?: FiscalYear;
  entregaR1VML?: string;
  feedbackR1Dell?: string;
  entregaR2VML?: string;
  feedbackR2Dell?: string;
  entregaR3VML?: string;
  feedbackR3Dell?: string;
  entregaR4VML?: string;
  feedbackR4Dell?: string;
  position?: number;
  columnId?: string;
}

export interface UpdateKanbanCardDto extends Partial<CreateKanbanCardDto> {
  // Extensão do CreateKanbanCardDto com todos os campos opcionais
}

export interface MoveKanbanCardDto {
  columnId: string;
  position: number;
  status?: KanbanStatus;
}

export interface KanbanFilters {
  status?: string;
  week?: string;
  quarter?: string;
  fy?: string;
  cliente?: string;
  brand?: string;
  frente?: string;
  columnId?: string;
}

export interface KanbanStats {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  byFrente: Array<{ frente: string; count: number }>;
  topClientes: Array<{ cliente: string; count: number }>;
}

// Labels para exibição
export const StatusLabels: Record<KanbanStatus, string> = {
  [KanbanStatus.BACKLOG]: 'Backlog',
  [KanbanStatus.FILES_TO_STUDIO]: 'Files to Studio',
  [KanbanStatus.REVISAO_TEXTO]: 'Revisão de Texto',
  [KanbanStatus.REVIEW_DELL]: 'Review Dell',
  [KanbanStatus.FINAL_MATERIAL]: 'Final Material',
  [KanbanStatus.ASSET_RELEASE]: 'Asset Release',
  [KanbanStatus.COMPLETED]: 'Completed',
};

export const VFTypeLabels: Record<VFType, string> = {
  [VFType.NO_VF]: 'Sem VF',
  [VFType.MICROSOFT_JMA_CS]: 'Microsoft JMA (CS)',
  [VFType.OTHER]: 'Outro',
};

export const AssetTypeLabels: Record<AssetType, string> = {
  [AssetType.ESTATICO]: 'Estático',
  [AssetType.VIDEO]: 'Vídeo',
  [AssetType.WIREFRAME]: 'Wireframe',
  [AssetType.GIF]: 'GIF',
  [AssetType.STORY]: 'Story',
  [AssetType.MOLDURA]: 'Moldura',
  [AssetType.AW_STORY]: 'AW Story',
  [AssetType.HTML]: 'HTML',
  [AssetType.OTHER]: 'Outro',
};

export const FrenteLabels: Record<WorkfrontFrente, string> = {
  [WorkfrontFrente.SOCIAL]: 'Social',
  [WorkfrontFrente.DISPLAY]: 'Display',
  [WorkfrontFrente.EMAIL]: 'Email',
  [WorkfrontFrente.LANDING_PAGE]: 'Landing Page',
  [WorkfrontFrente.PRINT]: 'Print',
  [WorkfrontFrente.OTHER]: 'Outro',
};

// Opções para dropdowns
export const KanbanStatusOptions = Object.entries(StatusLabels).map(([value, label]) => ({
  value,
  label,
}));

export const VFTypeOptions = Object.entries(VFTypeLabels).map(([value, label]) => ({
  value,
  label,
}));

export const AssetTypeOptions = Object.entries(AssetTypeLabels).map(([value, label]) => ({
  value,
  label,
}));

export const WorkfrontFrenteOptions = Object.entries(FrenteLabels).map(([value, label]) => ({
  value,
  label,
}));

export const FiscalYearOptions = [
  { value: 'FY25', label: 'FY25' },
  { value: 'FY26', label: 'FY26' },
  { value: 'FY27', label: 'FY27' },
  { value: 'FY28', label: 'FY28' },
];
