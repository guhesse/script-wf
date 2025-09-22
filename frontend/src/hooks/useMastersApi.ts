import { useState, useCallback, useRef } from 'react';
import type { ListMastersResponse, MasterAsset, MasterFileType, MasterEditableType } from '@/types';
import { toast } from 'sonner';

export interface MastersFilters {
  search?: string;
  brand?: string;
  fileType?: MasterFileType;
  editableType?: MasterEditableType;
  tag?: string;
  tagsAny?: string[];
  tagsAll?: string[];
  page?: number;
  pageSize?: number;
}

const buildQuery = (filters: MastersFilters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v) && v.length === 0) return;
    if (Array.isArray(v)) {
      if (k === 'tagsAny') params.set('tagsAny', v.join(','));
      else if (k === 'tagsAll') params.set('tagsAll', v.join(','));
    } else {
      params.set(k, String(v));
    }
  });
  return params.toString();
};

export const useMastersApi = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ListMastersResponse | null>(null);
  const dataRef = useRef<ListMastersResponse | null>(null);
  // Evita chamadas duplicadas em StrictMode (montagem dupla) mantendo cache rápido de promessas recentes
  const inFlightRef = useRef<Set<string>>(new Set());

  const listMasters = useCallback(async (filters: MastersFilters = {}) => {
    setIsLoading(true);
    try {
      const qs = buildQuery(filters);
      const inFlight = inFlightRef.current;
      if (inFlight.has(qs)) {
        // Já existe chamada igual recente -> evita duplicação
        return dataRef.current;
      }
      inFlight.add(qs);
      const res = await fetch(`/api/masters${qs ? `?${qs}` : ''}`);
      const json: ListMastersResponse = await res.json();
      setData(json);
      dataRef.current = json;
      return json;
    } catch (e) {
      console.error('Erro ao listar masters', e);
      toast.error('Erro ao buscar masters');
      throw e;
    } finally {
      inFlightRef.current.delete(buildQuery(filters));
      setIsLoading(false);
    }
  }, []);

  const getOne = useCallback(async (id: string): Promise<MasterAsset | null> => {
    try {
      const res = await fetch(`/api/masters/${id}`);
      const json = await res.json();
      return json.success ? json.asset : null;
    } catch (e) {
      console.error('Erro ao obter master', e);
      return null;
    }
  }, []);

  const uploadMaster = useCallback(async (params: {
    file: File;
    title?: string;
    brand?: string;
    editableType?: MasterEditableType;
    tags?: string[];
    subfolder?: string;
    previewBase64?: string;
    description?: string;
  }) => {
    setIsLoading(true);
    try {
      const form = new FormData();
      form.append('file', params.file);
      if (params.title) form.append('title', params.title);
      if (params.brand) form.append('brand', params.brand);
      if (params.editableType) form.append('editableType', params.editableType);
      if (params.subfolder) form.append('subfolder', params.subfolder);
    if (params.tags && params.tags.length) form.append('tags', params.tags.join(','));
    if (params.previewBase64) form.append('previewBase64', params.previewBase64);
    if (params.description) form.append('description', params.description);
      const res = await fetch('/api/masters/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || 'Falha no upload');
        throw new Error(json.error || 'Falha upload');
      }
      toast.success('Master enviado!');
      // Atualiza listagem rapidamente
      await listMasters({ page: 1, pageSize: data?.pagination.pageSize || 24 });
      return json.asset as MasterAsset;
    } catch (e) {
      console.error('Erro upload master', e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [listMasters, data]);

  return { isLoading, data, listMasters, getOne, uploadMaster };
};
