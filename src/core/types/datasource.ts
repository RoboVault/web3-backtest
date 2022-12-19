import type { OnDataCallback } from "./core";





export abstract class DataSource {
    abstract init(): Promise<any>
    abstract run(ondata: OnDataCallback<any>): Promise<any>
    
}