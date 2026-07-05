/**
 * lunar-javascript 没有官方类型定义，这里只声明本项目用到的最小 API
 * （semester-utils.ts 通过元宵节推算春学期开学日）。
 */
declare module "lunar-javascript" {
  export class Solar {
    getYear(): number;
    getMonth(): number;
    getDay(): number;
  }

  export class Lunar {
    /** 农历年月日构造，超出支持范围会抛异常 */
    static fromYmd(year: number, month: number, day: number): Lunar;
    getSolar(): Solar;
  }
}
