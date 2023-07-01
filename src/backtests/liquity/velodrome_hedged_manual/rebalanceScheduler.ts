

const ONE_DAY = 24 * 60 * 60 * 1000

export class RebalanceScheduler {
  status: 'idle' | 'pending' = 'idle'
  triggerTime: number = 0
 
  shouldRebalance(timestamp: number, triggered: boolean): boolean {
    const now = (new Date(timestamp))
    if (this.status === 'pending') {
      if (now.getTime() >= this.triggerTime) {
        this.status = 'idle'
        return triggered // only trigger if it's still out of balance
      }
    } else if (triggered) {
      // Trigger with a random delay between 0 and 4 hours between 
      // the hours of 8am to 10pm 
      const hour = now.getHours()
      const randomDelay = Math.floor(Math.random() * 4 * 60 * 60 * 1000)
      if (hour < 8) {
        const triggerTime = new Date(now.getTime())
        triggerTime.setHours(8)
        triggerTime.setMinutes(0)
        triggerTime.setTime(triggerTime.getTime() + randomDelay)
        this.triggerTime = triggerTime.getTime()
      } else if (hour > 22) {
        const triggerTime = new Date(now.getTime() + ONE_DAY)
        triggerTime.setHours(8)
        triggerTime.setMinutes(0)
        triggerTime.setTime(triggerTime.getTime() + randomDelay)
        this.triggerTime = triggerTime.getTime()
      } else {
        this.triggerTime = now.getTime() + randomDelay
      }
      this.status = 'pending'
    }

    return false
  }
}