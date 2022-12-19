


export abstract class Strategy {
    abstract before(): Promise<void>
    abstract after(): Promise<void>
    abstract onData(data: any): Promise<void>
}