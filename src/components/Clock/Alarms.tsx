import { Fragment, useEffect, useRef, useState } from "react"
import { PlusIcon } from "../../assets/PlusIcon"
import { SettingsIcon } from "../../assets/SettingsIcon"
import genUid from "light-uid"
import { FrequencyInput } from "./FrequencyInput"
import { AudioInput } from "./AudioInput"
import { invoke } from "@tauri-apps/api/core"
import { BaseDirectory, remove } from "@tauri-apps/plugin-fs"
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import * as path from '@tauri-apps/api/path'
import Database from "@tauri-apps/plugin-sql"

export function Alarms({ clockId, updateData, storedAlarms }: { clockId: string, storedAlarms?: Alarm[], updateData: (newData: Partial<{ timerRingtone?: string, alarms?: Alarm[] }>) => void }) {
    const [ alarms, setAlarms ] = useState<Alarm[]>([])

    const addAlarm = useRef<HTMLDivElement>(null)
    const [ newAlarmModalVisible, setNewAlarmModalVisible ] = useState(false)
    const [ newAlarmHours, setNewAlarmHours ] = useState("06")
    const [ newAlarmMinutes, setNewAlarmMinutes ] = useState("00")
    const [ newAlarmFormat, setNewAlarmFormat ] = useState("PM")
    const newAlarmLabelInput = useRef<HTMLInputElement>(null)
    const [ newAlarmFrequency, setNewAlarmFrequency ] = useState("Once")
    const [ newAlarmFilePath, setNewAlarmFilePath ] = useState("")

    const editAlarm = useRef<HTMLButtonElement>(null)
    const [ editAlarmModalIndex, setEditAlarmModalIndex ] = useState(-1)
    const [ alarmHours, setAlarmHours ] = useState("06")
    const [ alarmMinutes, setAlarmMinutes ] = useState("00")
    const [ alarmFormat, setAlarmFormat ] = useState("PM")
    const alarmLabel = useRef<HTMLInputElement>(null)
    const [ alarmFrequency, setAlarmFrequency ] = useState("Once")
    const [ editAlarmFilePath, setEditAlarmFilePath ] = useState("")

    const [ ringingModalVisible, setRingingModalVisible ] = useState(false)
    const [ ringingAlarm, setRingingAlarm ] = useState<Alarm | null>(null)
    const ringingRingtone = useRef(new Audio())
    let db: Database

    const checkPermission = async () => {
        if (!(await isPermissionGranted())) {
            return (await requestPermission()) === 'granted'
        }
        return true
    }

    const resetStateValues = () => {
        setNewAlarmHours("06")
        setNewAlarmMinutes("00")
        setNewAlarmFormat("PM")
        setNewAlarmFrequency("Once")
        setNewAlarmFilePath("")
        setEditAlarmModalIndex(-1)
    }

    const handleClickOutside = (e: MouseEvent) => {
        if(e.target !== addAlarm.current) {
            setNewAlarmModalVisible(false) 
            resetStateValues()  
        }

        if(!editAlarm.current?.contains(e.target as Node)) setEditAlarmModalIndex(-1)
    }

    useEffect(() => {
        window.addEventListener('click', handleClickOutside)
        return () => window.removeEventListener('click', handleClickOutside)
    }, [newAlarmModalVisible, editAlarmModalIndex])

    const handleNewAlarm = async () => {
        const newLabel = newAlarmLabelInput.current?.value || 'New Alarm'
        const newTime = `${String(newAlarmHours).padStart(2, '0')}:${String(newAlarmMinutes).padStart(2, '0')} ${newAlarmFormat}`
        
        let filePath
        if(newAlarmFilePath === 'default' || newAlarmFilePath === "") {
           filePath = await path.join(BaseDirectory.AppData.toString(), 'alarm-default.mp3')
        } else {
            filePath = newAlarmFilePath
        }
        

        const newAlarm: Alarm = { id: genUid(), clockId: clockId, label: newLabel, time: newTime, postponedTime: null, active: false, frequency: newAlarmFrequency, ringtone: filePath }
        setAlarms(prev => [...prev, newAlarm])
        setNewAlarmModalVisible(false)
        resetStateValues()
    }

    const handleEditAlarm = async (alarm: Alarm) => {
        if(!alarmFrequency) return 

        const newLabel = alarmLabel.current?.value || alarm.label
        const newTime = `${String(alarmHours).padStart(2, '0')}:${String(alarmMinutes).padStart(2, '0')} ${alarmFormat}`

        let filePath
        if(editAlarmFilePath === 'default' || editAlarmFilePath === "") {
           filePath = await path.join(BaseDirectory.AppData.toString(), 'alarm-default.mp3')
        } else {
            filePath = editAlarmFilePath
        }

        const newAlarm = { label: newLabel, time: newTime, frequency: alarmFrequency, ringtone: filePath }
        setAlarms(prev => prev.map(a => a.id === alarm.id ? { ...alarm, ...newAlarm } : alarm))
        resetStateValues()
    }

    const toggleAlarmEdit = (alarm: Alarm, index: number) => {
        setEditAlarmModalIndex(index)
        const [hours, minutes] = alarm.time.split(" ")[0].split(":")
        const format = alarm.time.split(" ")[1]
        setAlarmHours(hours)
        setAlarmMinutes(minutes)
        setAlarmFormat(format)
    }

    const toggleActiveState = (clickedAlarm: Alarm) => {
        setAlarms((prev) => {
            const newAlarms = prev.map((alarm) => {
                if (alarm.time === clickedAlarm.time && alarm.id !== clickedAlarm.id) return { ...alarm, active: false, postponedTime: null }
                
                if (alarm.id === clickedAlarm.id) return { ...alarm, active: !alarm.active, postponedTime: null }

                return alarm
            })
            return newAlarms
        })
    }

    const checkAlarms = async () => {
        const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
        const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'short' })
        const activeAlarm = alarms.find(alarm => {
            const postponedTimeWithSeconds = alarm.postponedTime ? `${alarm.postponedTime.split(" ")[0]}:00 ${alarm.postponedTime.split(" ")[1]}` : null

            const [time, period] = alarm.time.split(" ")
            const alarmTimeWithSeconds = `${time}:00 ${period}`

            const postponedMatch = postponedTimeWithSeconds  === currentTime
            const originalMatch = alarm.active && alarmTimeWithSeconds === currentTime

            return postponedMatch || originalMatch
        })

        const isWeekend = currentDay === "Sat" || currentDay === "Sun"
        const matchesFrequency = activeAlarm?.frequency === "Weekend" ? isWeekend : activeAlarm?.frequency.split(", ").includes(currentDay)
        
        if(activeAlarm?.frequency !== "Once" && !matchesFrequency || !activeAlarm) return

        setRingingAlarm(activeAlarm)    
        setRingingModalVisible(true)
        setAlarms(alarms.map(alarm => alarm.id === activeAlarm.id ? { ...alarm, postponedTime: null } : alarm )) 
        const filePath = await path.join(await path.appDataDir(), activeAlarm.ringtone)
        await invoke("play_ringtone", { path: filePath })
        if ((await checkPermission()) ) {
            sendNotification({ title: 'Alarm Sounding', body: 'Beep Beep'});
        }
    }

    useEffect(() => {
        const interval = setInterval(checkAlarms, 1000)
        return () => clearInterval(interval)
    }, [alarms])

    const handleAlarmStop = async () => {
        setRingingModalVisible(false)
        setRingingAlarm(null)
        ringingRingtone.current.pause()
        ringingRingtone.current.currentTime = 0
        ringingRingtone.current = new Audio()

        if(ringingAlarm?.frequency === "Once") setAlarms(prev => prev.map(alarm => alarm.id === ringingAlarm?.id ? { ...ringingAlarm, active: false } : alarm))
        await invoke("stop_ringtone")
    }

    const handleAlarmSleep = () => {
        setRingingModalVisible(false)
        ringingRingtone.current.pause()
        ringingRingtone.current.currentTime = 0
        ringingRingtone.current = new Audio()

        const newAlarms = alarms.map(alarm => {
            if (alarm.id === ringingAlarm?.id) {
                const date = new Date()
                const [time, period] = alarm.time.split(' ')
                let hours = Number(time.split(':')[0])
                const minutes = Number(time.split(':')[1])
    
                if (period === 'PM' && hours !== 12) hours += 12
                if (period === 'AM' && hours === 12) hours = 0
    
                date.setHours(hours, minutes + 10)
    
                const postponedHours = date.getHours() % 12 || 12
                const postponedMinutes = date.getMinutes()
                const postponedPeriod = date.getHours() >= 12 ? 'PM' : 'AM'

                console.log(`${String(postponedHours).padStart(2, '0')}:${String(postponedMinutes).padStart(2, '0')} ${postponedPeriod}`)
                return { ...alarm, postponedTime: `${String(postponedHours).padStart(2, '0')}:${String(postponedMinutes).padStart(2, '0')} ${postponedPeriod}`}
            }
            return alarm
        })
        setAlarms(newAlarms)
    }

    const handleAlarmRemove = async (alarm: Alarm) => {
        removeFile(alarm)

        setAlarms(alarms.filter((a) => alarm.id !== a.id))
        resetStateValues()
        try {
            if(!db) db = await Database.load('sqlite:data.db')
            await db.execute("DELETE FROM alarms WHERE id LIKE $1", [alarm.id])
        } catch(error) {
            console.log(error)
        }
    }

    const removeFile = async (alarm: Alarm) => {
        try {
            if(!db) db = await Database.load('sqlite:data.db')
            const clocks: Clock[] = await db.select("SELECT * FROM clocks")
            const remainingAlarms: Alarm[] = await db.select("SELECT * FROM alarms WHERE id NOT LIKE $1", [alarm.id])

            const fileInUse = clocks.some(clock => clock.timerRingtone === alarm.ringtone || remainingAlarms.some(a => a.ringtone === alarm.ringtone))
            if(!fileInUse) return

            await remove(alarm.ringtone, { baseDir: BaseDirectory.AppData })
        } catch(error) {
            console.log("Error: ", error)
        }
    }

    useEffect(() => {
        updateData({ alarms })
    }, [alarms])

    useEffect(() => { 
        if(storedAlarms) setAlarms(storedAlarms ?? []) 
    }, [])

    return <>
        <div className="alarms">
            {newAlarmModalVisible && <div className="modal" onClick={(e) => e.stopPropagation()}>
                <p className="label">New Alarm</p>
                <div>
                    <label htmlFor="label">Label</label>
                    <input type="text" id="label" ref={ newAlarmLabelInput }/>
                </div>
                <div className="time-input">
                    <label htmlFor="time">Time</label>
                    <input type="number" id="hours" value={newAlarmHours} onChange={(e) => { 
                        const value = e.target.value
                        if(value.length > 2 && value.startsWith("0")) return
                        if(value === "" || Number(value) >= 1 && Number(value) <= 12) setNewAlarmHours(value)
                    }}/> : 
                    <input type="number" id="minutes" value={newAlarmMinutes} onChange={(e) => { 
                        const value = e.target.value
                        if(value.length > 2 && value.startsWith("0")) return
                        if(value === "" || Number(value) >= 0 && Number(value) <= 59) setNewAlarmMinutes(value)
                    }}/>
                    <button className="format" onClick={() => {
                        if(newAlarmFormat === "PM") setNewAlarmFormat("AM")
                        if(newAlarmFormat === "AM") setNewAlarmFormat("PM")
                    }}>{newAlarmFormat}</button>
                </div>
                <FrequencyInput setFrequencyValue={ setNewAlarmFrequency } frequencyValue={ newAlarmFrequency }/>
                <AudioInput setFilePath={setNewAlarmFilePath} filePath={newAlarmFilePath}/>
                <button onClick={handleNewAlarm}>Create</button>
            </div>}
            <div className="alarm-list">
                {alarms.map((alarm, index) => (
                <div key={index} className="alarm">
                    <p>{alarm.label} | {alarm.time} | {alarm.frequency}</p>
                    <button onClick={(e) => {
                        e.stopPropagation()
                        toggleAlarmEdit(alarm, index)
                        }} ref={ editAlarm } className="edit"><span><SettingsIcon /></span></button>
                    <div className={`toggle ${alarm.active ? "active" : ''}`} onClick={() => toggleActiveState(alarm)}></div>
                </div>
                ))}
            </div>
            {alarms.map((alarm, index) => (
                <Fragment key={index}>
                {editAlarmModalIndex === index && <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <p className="label">Edit Alarm</p>
                    <div>
                        <label htmlFor="label">Label</label>
                        <input type="text" id="label" ref={ alarmLabel } defaultValue={alarm.label}/>
                    </div>
                    <div className="time-input">
                        <label htmlFor="time">Time</label>
                        <input type="number" id="hours" value={alarmHours} onChange={(e) => { 
                            const value = e.target.value
                            if(value.length > 2 && value.startsWith("0")) return
                            if(value === "" || Number(value) >= 1 && Number(value) <= 12) setAlarmHours(value)
                        }}/> : 
                        <input type="number" id="minutes" value={alarmMinutes} onChange={(e) => { 
                            const value = e.target.value
                            if(value.length > 2 && value.startsWith("0")) return
                            if(value === "" || Number(value) >= 0 && Number(value) <= 59) setAlarmMinutes(value)
                        }}/>
                        <button className="format" onClick={() => {
                            if(alarmFormat === "PM") setAlarmFormat("AM")
                            if(alarmFormat === "AM") setAlarmFormat("PM")
                        }}>{alarmFormat}</button>
                    </div> 
                    <FrequencyInput setFrequencyValue={ setAlarmFrequency } frequencyValue={ alarm.frequency }/>
                    <AudioInput setFilePath={setEditAlarmFilePath} filePath={alarm.ringtone}/>
                    <button onClick={() => handleEditAlarm(alarm)}>Save</button>
                    <button className="remove" onClick={() => handleAlarmRemove(alarm)}><span><PlusIcon /></span></button>
                </div>}
                </Fragment>
            ))}
            <div className="controls">
                <div className="add-alarm" onClick={(e) => { 
                    e.stopPropagation()
                    setNewAlarmModalVisible(true)
                }} ref={ addAlarm }><span><PlusIcon /></span></div>
            </div> 
            {ringingModalVisible && <div className="modal">
                <p className="label">{ringingAlarm?.label} | {ringingAlarm?.time}</p>
                <div className="buttons">
                    <button onClick={handleAlarmStop}>Stop</button>
                    <button onClick={handleAlarmSleep}>Sleep (10 min)</button>
                </div>
            </div>}
        </div>
    </>
}