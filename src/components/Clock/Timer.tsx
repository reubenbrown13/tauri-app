import { ChangeEvent, useEffect, useState } from "react"
import { StopwatchProgress } from "../../assets/ClockIcons/StopwatchProgress"
import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { BaseDirectory, copyFile, remove } from "@tauri-apps/plugin-fs"
import * as path from '@tauri-apps/api/path'
import Database from "@tauri-apps/plugin-sql"

export function Timer({ updateData, clockId, storedRingtone }: { storedRingtone?: string, clockId: string, updateData: (newData: Partial<{ timerRingtone?: string, alarms?: Alarm[] }>) => void }) {
    const [ isRunning, setIsRunning ] = useState(false)
    const [ isStopped, setIsStopped ] = useState(false)
    const [ hours, setHours ] = useState("00")
    const [ minutes, setMinutes ] = useState("00")
    const [ seconds, setSeconds ] = useState("00")
    const [ initialSeconds, setInitialSeconds ] = useState(0)
    const [ progress, setProgress ] = useState(100)
    const pattern = /^\d{0,2}$/
    const [ ringtoneName, setRingtoneName ] = useState("Default Ringtone")
    const [ ringtonePath, setRingtonePath ] = useState("alarm-default.mp3")
    let db: Database

    const handletHours = (e: ChangeEvent<HTMLInputElement>) => { 
        const value = e.target.value
        if(pattern.test(value)) setHours(value.length === 1 ? `0${value}` : value)
    }

    const handleMinutes = (e: ChangeEvent<HTMLInputElement>) => { 
        const value = e.target.value
        if(pattern.test(value)) setMinutes(value.length === 1 ? `0${value}` : value)
    }

    const handleSeconds = (e: ChangeEvent<HTMLInputElement>) => { 
        const value = e.target.value
        if(pattern.test(value)) setSeconds(value.length === 1 ? `0${value}` : value)
    }

    useEffect(() => {
        if(!isRunning) return 

        const timer = setInterval(async () => {
            let totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds)

            if(!totalSeconds) {
                const filePath = await path.join(await path.appDataDir(), ringtonePath)
                await invoke("play_ringtone", { path: filePath })
                setIsRunning(false)
                if (timer) clearInterval(timer)
                return
            }

            totalSeconds--

            const updatedHours = Math.floor(totalSeconds / 3600)
            const updatedMinutes = Math.floor((totalSeconds % 3600) / 60)
            const updatedSeconds = totalSeconds % 60

            setHours(String(updatedHours).padStart(2, "0"))
            setMinutes(String(updatedMinutes).padStart(2, "0"))
            setSeconds(String(updatedSeconds).padStart(2, "0"))
            
            setProgress(100 - (totalSeconds / initialSeconds) * 100)
        }, 1000)

        return () => { if (timer) clearInterval(timer) }
    }, [isRunning, hours, minutes, seconds])

    const handleStart = () => {
        setIsRunning(true)
        setIsStopped(false)
        setInitialSeconds(parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds))
    }

    const handleStop = async () => {
        setIsRunning(false)
        if(`${hours}:${minutes}:${seconds}` !== "00:00:00") setIsStopped(true)

        try {
            await invoke("stop_ringtone")
        } catch(error) {
            console.log("Error: ", error)
        }
    }

    const handleReset = () => {
        setIsRunning(false)
        setIsStopped(false)
        setHours("00")
        setMinutes("00")
        setSeconds("00")
        setProgress(100)
    }

    const handleSelectFile = async () => {
        try {
            const prevFile = ringtonePath

            const fullPath = await open({ filters: [ { name: "Audio", extensions: [ "wav", "mp3", "ogg", "flac" ] } ] })
            if(!fullPath) return setRingtonePath('alarm-default.mp3')
            //const path = fullPath.split("\\").pop() || ''
            const newPath = await path.basename(fullPath)|| ''
            setRingtonePath(newPath)
            
            const name = newPath.split(".")[0]
            if(!name) return
            setRingtoneName(name)

            await copyFile(fullPath, newPath , { toPathBaseDir: BaseDirectory.AppData })

            if(!db) db = await Database.load('sqlite:data.db')
            const remainingClocks: Clock[] = await db.select("SELECT * FROM clocks WHERE id NOT LIKE $1", [clockId])
            const alarms: Alarm[] = await db.select("SELECT * FROM alarms")

            const fileInUse = remainingClocks.some(clock => clock.timerRingtone === prevFile || alarms.some(a => a.ringtone === prevFile))
            if(!fileInUse && prevFile !== 'alarm-default.mp3') await remove(prevFile, { baseDir: BaseDirectory.AppData })
        } catch(error) {
            console.log("Error: ", error)
        }
    }

    useEffect(() => { 
        updateData({ timerRingtone: ringtonePath }) 
    }, [ringtonePath])

    useEffect(() => {
        if(storedRingtone) {
            setRingtonePath(storedRingtone)
            if(storedRingtone === 'alarm-default.mp3') return setRingtoneName("Default Ringtone")
            setRingtoneName(storedRingtone.split(".")[0])
        }
    }, [])

    return <>
        <div className="timer">
            <div className="ringtone">
                <button onClick={handleSelectFile}>Change ringtone</button>
                <p>{ringtoneName}</p>
            </div>
            <div className="display">
                <StopwatchProgress progress={progress}/>
                <div className="input">
                    {isRunning || isStopped ? <p>{`${hours} : ${minutes} : ${seconds}`}</p> : <>
                    <input type="text" value={hours} onChange={handletHours}/>:
                    <input type="text" value={minutes} onChange={handleMinutes}/>:
                    <input type="text" value={seconds} onChange={handleSeconds}/></>}
                </div>
            </div>
            <div className="controls">
                <button onClick={handleStart}>Start</button>
                <button onClick={handleStop}>Stop</button>
                <button onClick={handleReset}>Reset</button>
            </div>    
        </div>
    </>
}