/** A vendor that answers what a test says, per key, and remembers what it was asked. Every key works unless told. */
import type { CheckResult, CheckTarget, VendorChecks } from '../checks'

export class FakeVendorChecks implements VendorChecks {
  readonly asked: CheckTarget[] = []
  readonly listed = new Map<string, string[]>()
  private answers = new Map<string, CheckResult>()

  answer(key: string | null, result: CheckResult): this {
    this.answers.set(key ?? '', result)
    return this
  }

  /** What an endpoint lists, by its address; none for one not told. */
  lists(baseUrl: string, models: string[]): this {
    this.listed.set(baseUrl, models)
    return this
  }

  async listModels(target: CheckTarget): Promise<string[]> {
    return this.listed.get(target.baseUrl ?? '') ?? []
  }

  async check(target: CheckTarget): Promise<CheckResult> {
    this.asked.push(target)
    return this.answers.get(target.key ?? '') ?? { ok: true }
  }
}
