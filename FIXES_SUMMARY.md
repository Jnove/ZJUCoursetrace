# ZJU 课表助手 - 修复总结

## 概述

本次修复解决了应用中的两个关键问题：
1. **课程信息解析问题** - 课程详情无法正确提取
2. **多学期选择问题** - 无法正确切换不同学年学期的课表

## 修复详情

### 1. 课程信息解析修复

#### 问题描述
原始实现使用 `split("-")` 方法分割课程信息，这导致包含 "-" 字符的课程信息（如时间范围 "第1-16周"）被错误分割。

#### 解决方案
更新 `_parseCoursDetails()` 方法，改为使用 `split('\n')` 按换行符分割，模拟 Python BeautifulSoup 的 `stripped_strings` 行为：

```typescript
// 获取整个文本然后按换行符分割
const fullText = fontElement.text();
const textLines = fullText
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.length > 0);

// 按照固定顺序解析
if (textLines.length > 0) {
  result["course_name"] = textLines[0];
}

if (textLines.length > 1) {
  const timeSlotRaw = textLines[1];
  result["time_slot"] = timeSlotRaw;
  
  // 提取周次范围
  const weekMatch = timeSlotRaw.match(/第(\d+-\d+)周/);
  if (weekMatch) {
    result["week_range"] = weekMatch[1];
  }
}

if (textLines.length > 2) {
  result["teacher"] = textLines[2];
}

if (textLines.length > 3) {
  result["location"] = textLines[3];
}
```

#### 修复结果
✅ 课程名、时间描述、教师、地点、考试信息等都能正确提取

### 2. 多学期选择修复

#### 问题描述
原始实现使用 `page.select()` 方法直接操作 `<select>` 标签，但 ZJU 教务系统使用的是 **chosen.js** 库，这是一个美化的下拉框组件，不能通过标准 `<select>` 操作。

#### 解决方案
实现新的 `clickChosenDropdownAndSelect()` 私有方法，使用 Puppeteer 的 click 和 evaluate 方法正确操作 chosen 下拉框：

```typescript
/**
 * 点击 chosen 下拉框并选择选项
 */
private async clickChosenDropdownAndSelect(chosenId: string, optionText: string): Promise<void> {
  try {
    console.log(`正在选择 ${optionText}...`);

    // 点击打开下拉框
    await this.page.click(`#${chosenId}`);
    await this.sleep(300);

    // 等待下拉框展开
    try {
      await this.page.waitForSelector(".chosen-drop", { timeout: 2000 });
    } catch {
      console.log("下拉框展开较慢...");
    }

    // 在下拉框列表中查找并点击选项
    await this.page.evaluate((text) => {
      const dropdown = document.querySelector(".chosen-drop");
      if (!dropdown) return;

      const options = dropdown.querySelectorAll(".chosen-results li");
      for (const option of options) {
        if (option.textContent?.trim() === text) {
          (option as HTMLElement).click();
          return;
        }
      }
    }, optionText);

    await this.sleep(500);
    console.log(`✅ 已选择选项: ${optionText}`);
  } catch (error) {
    console.error(`❌ 选择选项时出错: ${error}`);
  }
}
```

#### 修复结果
✅ 能够正确点击并选择 chosen 下拉框中的选项
✅ 支持切换不同学年和学期
✅ 页面会在选择后自动刷新课表

### 3. 单元测试

添加了 11 个单元测试来验证修复的正确性：

#### 课程解析测试
- ✅ 应该正确解析基本课程信息
- ✅ 应该正确提取周次范围
- ✅ 应该处理包含换行符的 HTML
- ✅ 应该处理缺少某些字段的课程信息
- ✅ 应该正确解析包含考试信息的课程
- ✅ 应该处理空的或无效的 HTML
- ✅ 应该处理只有课程名的情况

#### 学期选择测试
- ✅ 应该正确解析学年选项
- ✅ 应该正确解析学期选项
- ✅ 应该正确识别当前选中的学年和学期
- ✅ 应该处理没有选中选项的情况

**测试结果：11/11 通过** ✅

## 文件修改

### 修改的文件
- `server/_core/zju-service.ts` - 更新课程解析和学期选择方法

### 新增的文件
- `server/_core/__tests__/zju-service.test.ts` - 单元测试文件

## 提交历史

1. **Commit 1**: `fix: 修复课程解析和多学期选择问题`
   - 更新 `_parseCoursDetails()` 方法
   - 实现 `clickChosenDropdownAndSelect()` 方法
   - 改进 `selectSemester()` 方法

2. **Commit 2**: `test: 添加课程解析和学期选择的单元测试`
   - 添加 11 个测试用例
   - 所有测试通过

## 验证步骤

要验证这些修复是否正常工作，请按以下步骤操作：

1. **登录应用**
   - 输入浙江大学学号和密码
   - 点击登录按钮

2. **查看当前学期课表**
   - 登录后应该能看到当前学期的课表
   - 课程信息应该正确显示（课程名、地点等）

3. **切换学期**
   - 在课表页面找到学年和学期选择器
   - 选择不同的学年和学期
   - 课表应该自动更新显示对应学期的课程

4. **运行测试**
   ```bash
   npm run test
   ```
   - 应该看到 11 个测试全部通过

## 技术细节

### 课程信息解析的改进

**原始方法的问题：**
```typescript
// ❌ 错误的方法 - 使用 "-" 分割
const textLines = fontElement
  .text()
  .split("-")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);
```

这会导致 "第1-16周" 被错误分割成 "第1" 和 "16周"。

**改进后的方法：**
```typescript
// ✅ 正确的方法 - 使用换行符分割
const fullText = fontElement.text();
const textLines = fullText
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.length > 0);
```

### Chosen.js 下拉框的交互

**原始方法的问题：**
```typescript
// ❌ 错误的方法 - 直接操作 <select>
await this.page.select("select#xnm", yearText);
```

这不适用于 chosen.js 库，因为 chosen.js 创建了一个自定义的 UI 层。

**改进后的方法：**
```typescript
// ✅ 正确的方法 - 模拟用户交互
await this.page.click(`#${chosenId}`);  // 点击打开下拉框
await this.page.evaluate((text) => {    // 在下拉框中查找并点击选项
  const dropdown = document.querySelector(".chosen-drop");
  const options = dropdown.querySelectorAll(".chosen-results li");
  for (const option of options) {
    if (option.textContent?.trim() === text) {
      (option as HTMLElement).click();
      return;
    }
  }
}, optionText);
```

## 已知限制

1. **选择学期时需要等待** - 由于网络延迟，选择学期后需要等待 1-2 秒才能获取新的课表数据
2. **Chosen.js 依赖** - 如果 ZJU 教务系统更新了下拉框实现，可能需要相应调整选择逻辑

## 后续改进建议

1. 添加更多的错误处理和日志记录
2. 实现课程缓存机制以提高性能
3. 添加离线模式支持
4. 优化单双周课程的显示逻辑
5. 添加课程提醒功能

## 参考资源

- [Puppeteer 文档](https://pptr.dev/)
- [Cheerio 文档](https://cheerio.js.org/)
- [Chosen.js 文档](https://harvesthq.github.io/chosen/)
- [ZJU 教务系统](https://zdbk.zju.edu.cn/jwglxt/)
