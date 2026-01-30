import { create } from "zustand"

type MainStore = {
    gridScale: number
    setGridScale: (scale: number) => void

    gridSize: { width: number, height: number }
    setGridSize: (size: { width?: number, height?: number }) => void

    gridElements: React.ReactElement[]
    addGridElement: (element: React.ReactElement) => void
    removeGridElement: (id: string) => void
    clearGrid: () => void

    autoClickerLimit: number
    setAutoClickerLimit: (value: number) => void
}

export const useMainStore = create<MainStore>(set => ({
    gridScale: 1, 
    setGridScale: (scale) => set({ gridScale: scale }),

    gridSize: { width: 0, height: 0 },
    setGridSize: (size) => set(state => ({
        gridSize: {
            ...state.gridSize,
            ...(size.width ? { width: size.width } : { width: state.gridSize.width }),
            ...(size.height ? { height: size.height } : { height: state.gridSize.height }),
        },
    })),

    gridElements: [],
    addGridElement: (element) => set(state => ({ gridElements: [ ...state.gridElements, element ]})),
    removeGridElement: (id) => set(state => ({ gridElements: state.gridElements.filter(element => typeof element.props !== 'undefined') })),
    clearGrid: () => set({ gridElements: [] }),

    autoClickerLimit: 1,
    setAutoClickerLimit: (value) => set({ autoClickerLimit: value })
}))