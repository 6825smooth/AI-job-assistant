/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { materialsRepository } from "@/storage";
import { Material } from "@/types";

type MaterialsContextValue = {
  materials: Material[];
  loading: boolean;
  refresh: () => Promise<void>;
  save: (material: Material) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const MaterialsContext = createContext<MaterialsContextValue | null>(null);

export function MaterialsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const nextMaterials = await materialsRepository.getAll();
    setMaterials(nextMaterials);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void materialsRepository
      .getAll()
      .then((nextMaterials) => {
        if (!cancelled) setMaterials(nextMaterials);
      })
      .catch((error) => console.error("[Materials] read failed", error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const value = useMemo<MaterialsContextValue>(() => ({
    materials,
    loading,
    refresh,
    save: async (material) => {
      const previous = materials;
      try {
        await materialsRepository.save(material);
        setMaterials(await materialsRepository.getAll());
      } catch (error) {
        setMaterials(previous);
        throw error;
      }
    },
    remove: async (id) => {
      const previous = materials;
      try {
        await materialsRepository.delete(id);
        setMaterials(await materialsRepository.getAll());
      } catch (error) {
        setMaterials(previous);
        throw error;
      }
    },
  }), [loading, materials]);

  return <MaterialsContext.Provider value={value}>{children}</MaterialsContext.Provider>;
}

export function useMaterials() {
  const context = useContext(MaterialsContext);
  if (!context) throw new Error("useMaterials must be used inside MaterialsProvider");
  return context;
}
