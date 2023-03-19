import type { OnDataCallback } from "./core";





export abstract class DataSource<T> {
    abstract init(): Promise<void>
    abstract run(ondata: OnDataCallback<T>): Promise<any>
    
}