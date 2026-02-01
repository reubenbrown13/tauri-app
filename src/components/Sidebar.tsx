import { useCallback, useEffect, useRef, useState } from "react"
import { Notepad } from "./Notepad"
import { useMainStore } from "../store/useMainStore"
import genUid from "light-uid"
import { NoteIcon } from "../assets/SidebarIcons/NoteIcon"
import { ExportIcon } from "../assets/SidebarIcons/ExportIcon"
import { ImportIcon } from "../assets/SidebarIcons/ImportIcon"
import { open, save } from "@tauri-apps/plugin-dialog"
import { AutoClicker } from "./AutoClicker"
import { MouseIcon } from "../assets/SidebarIcons/MouseIcon"
import Database from "@tauri-apps/plugin-sql"
import { ClearIcon } from "../assets/SidebarIcons/ClearIcon"
import { Clock } from "./Clock/Clock"
import { ClockIcon } from "../assets/SidebarIcons/ClockIcon"
import { invoke } from "@tauri-apps/api/core"
import { exit } from '@tauri-apps/plugin-process';
import * as path from '@tauri-apps/api/path'

export function Sidebar() {
    const [ showSidebar, setShowSidebar ] = useState(false)
    const sidebarRef = useRef(null)
    const iconRef = useRef(null)
    const addGridElement = useMainStore(state => state.addGridElement)
    const autoClickerLimit = useMainStore(state => state.autoClickerLimit)
    const setAutoClickerLimit = useMainStore(state => state.setAutoClickerLimit)
    const clearGrid = useMainStore(state => state.clearGrid)
    let db: Database

    const handleClickOutside = useCallback((e: MouseEvent) => {
        if(e.target !== iconRef.current) setShowSidebar(false)
    }, [])

    useEffect(() => {
        window.addEventListener('click', handleClickOutside)
        return () => window.removeEventListener('click', handleClickOutside)
    }, [handleClickOutside])

    const handleNewNote = async () => {
        const uId = genUid()
        addGridElement(<Notepad id={uId} key={uId}/>)
        setShowSidebar(false)
    }

    const handleNewAutoClicker = async () => {
        if(!autoClickerLimit) return

        const uId = genUid()
        addGridElement(<AutoClicker id={uId} key={uId}/>)
        setAutoClickerLimit(0)
        setShowSidebar(false)
    }

    const handleNewClock = async () => {
        const uId = genUid()
        addGridElement(<Clock id={uId} key={uId}/>)
        setShowSidebar(false)
    }

    const handleExport = async () => {
        const dstPath = await save({ defaultPath: "data.zip" , filters: [{ name: "ZIP File", extensions: ["zip"] }] })
        if(!dstPath) return

        const srcPath = await path.appDataDir()
        await invoke('export', { src: srcPath, dst: dstPath })
        setShowSidebar(false)
    }

    const handleImport = async () => {
        const srcPath = await open({ defaultPath: "data.zip", filters: [{ name: "ZIP File", extensions: ['zip'] }] })
        if(!srcPath) return

        const dstPath = await path.appDataDir()
        await invoke('import', { src: srcPath, dst: dstPath })
        window.location.reload()
        setShowSidebar(false)
    }

    const handleClear = async () => {
        clearGrid()

        try {
            if(!db) db = await Database.load("sqlite:data.db")

            await db.execute("DELETE FROM notes")
            await db.execute("DELETE FROM autoClicker")
            await db.execute("DELETE FROM clocks")
        } catch(error) {
            console.log(error)
        }
    }

    const handleQuit = async () => {
        await exit(0);
    }

    return <>   
        <div className="sidebar-icon" onClick={(e) => { 
            e.stopPropagation()
            setShowSidebar(!showSidebar) 
            }} ref={ iconRef }>
            <span></span>
            <span></span>
            <span></span>
        </div>
        <div className={`sidebar ${showSidebar ? 'show' : ''}`} onClick={(e) => e.stopPropagation()} ref={ sidebarRef }>
            <button onClick={handleNewNote}><span><NoteIcon /></span> New Note</button>
            <button onClick={handleNewClock}><span><ClockIcon /></span>New Clock</button>
            <button onClick={handleNewAutoClicker}><span><MouseIcon /></span>Auto Clicker</button>
            <button onClick={handleClear} className="clear"><span><ClearIcon /></span>Clear grid</button>
            <button onClick={handleQuit} className="quit"><span>X</span>Exit</button>
            <div className="import-export">
                <button onClick={handleExport}><span><ExportIcon /></span>Export</button>
                <button onClick={handleImport}><span><ImportIcon /></span>Import</button>
            </div>
        </div>    
    </>
}