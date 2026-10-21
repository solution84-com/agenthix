/** Why a sealed backup could not be read, in words a person reads. */

export class WrongKey extends Error {
  constructor() {
    super('That key does not open this backup.')
    this.name = 'WrongKey'
  }
}

export class DamagedBackup extends Error {
  constructor(detail: string) {
    super(`The backup is damaged or incomplete: ${detail}.`)
    this.name = 'DamagedBackup'
  }
}
