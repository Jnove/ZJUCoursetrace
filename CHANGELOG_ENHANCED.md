# 课表功能增强更新日志

## 版本：Enhanced v1.0

### 更新日期：2026-02-07

---

## 主要更新

### 1. 多学期课表自动获取

#### 功能描述
登录后自动获取所有学年学期的课表，并缓存有课表的学期信息。

#### 实现细节
- **登录时立即获取当前学期课表**：用户登录成功后，系统会立即获取并返回当前学期的课表数据
- **后台异步获取所有学期课表**：使用 `setImmediate` 在后台异步遍历所有学年学期，自动识别并缓存有课表的学期
- **智能学期识别**：通过检查页面是否显示"尚无您的课表"来判断该学期是否有课
- **自动缓存管理**：所有有课表的学期数据都会自动缓存，缓存有效期为30分钟

#### 涉及文件
- `server/api-routes.ts`：更新登录API，添加后台获取逻辑
- `server/_core/zju-service.ts`：已有 `getTimetableDataForSemester` 和 `getAllActiveSemesters` 方法

#### API 变化
- `POST /api/auth/login`：响应中新增 `current_schedule` 字段，包含当前学期课表
- `GET /api/schedule/active-semesters`：新增 `username` 查询参数，支持从缓存读取

---

### 2. 智能缓存机制

#### 功能描述
实现内存级别的课表数据缓存，优先从缓存读取，避免重复访问教务系统。

#### 实现细节

**缓存结构：**
```typescript
// 课表缓存：用户 -> 学期 -> 课表数据
const scheduleCache: Map<string, Map<string, { 
  courses: Course[]; 
  semester_info: any; 
  timestamp: number 
}>> = new Map();

// 有课学期列表缓存：用户 -> 学期列表
const activeSemestersCache: Map<string, { 
  semesters: any[]; 
  timestamp: number 
}> = new Map();
```

**缓存策略：**
- 缓存有效期：30分钟（`CACHE_DURATION = 30 * 60 * 1000`）
- 写入时机：登录、获取课表、后台获取
- 读取策略：优先从缓存读取，检查过期时间
- 过期处理：自动删除过期缓存

**学期键值格式：**
- 格式：`{学年}_{学期}`
- 示例：`2024-2025_1`、`2023-2024_2`

#### 涉及文件
- `server/api-routes.ts`：添加缓存相关函数和逻辑

#### 新增函数
- `getUserScheduleCache(username)`: 获取用户的课表缓存
- `cacheScheduleData(username, semesterKey, data)`: 缓存课表数据
- `getScheduleFromCache(username, semesterKey)`: 从缓存获取课表
- `getSemesterKey(year, term)`: 生成学期键值
- `fetchAllSemestersInBackground(username, service)`: 后台获取所有学期课表

---

### 3. 今日课程推算优化

#### 问题背景
原有的 `GET /api/schedule/todays-courses` 接口会重新访问课表页面，导致以下问题：
- 触发 `Error: Execution context was destroyed, most likely because of a navigation.`
- 增加教务系统访问压力
- 响应速度慢

#### 解决方案
从缓存的课表数据中推算今日课程，完全避免重新访问课表页面。

#### 实现细节

**推算逻辑：**
1. 从缓存中获取课表数据
2. 计算今天是星期几（1-7，周一到周日）
3. 筛选 `day_of_week` 匹配今天的课程
4. 返回今日课程列表

**代码示例：**
```typescript
// 计算今天是星期几
const today = new Date();
const dayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 6=周六
const todayDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // 转换为 1-7 格式

// 筛选今天的课程
const todaysCourses = courses.filter((course) => course.day_of_week === todayDayOfWeek);
```

#### 涉及文件
- `server/api-routes.ts`：重写 `GET /api/schedule/todays-courses` 接口

#### API 变化
- 新增 `username` 查询参数（必填）
- 新增 `semester` 查询参数（可选）
- 响应中新增 `day_of_week`、`semester`、`from_cache` 字段

---

### 4. API 接口优化

#### 所有课表相关接口都支持缓存

**优化的接口：**

1. **GET /api/schedule/timetable**
   - 新增 `username` 查询参数
   - 优先从缓存读取当前学期课表
   - 响应中新增 `from_cache` 字段

2. **GET /api/schedule/active-semesters**
   - 新增 `username` 查询参数
   - 优先从缓存读取学期列表
   - 响应中新增 `from_cache` 字段

3. **GET /api/schedule/timetable-by-semester**
   - 新增 `username` 查询参数
   - 优先从缓存读取指定学期课表
   - 响应中新增 `from_cache` 字段

4. **GET /api/schedule/todays-courses**
   - 新增 `username` 查询参数（必填）
   - 新增 `semester` 查询参数（可选）
   - 完全从缓存推算，不访问教务系统
   - 响应中新增 `day_of_week`、`semester`、`from_cache` 字段

#### 新增接口

**POST /api/schedule/clear-cache**
- 清除缓存接口
- 支持清除指定用户或所有用户的缓存
- 请求体：`{ username?: string }`

---

## 技术改进

### 1. 性能优化

- **减少网络请求**：优先从缓存读取，避免重复访问教务系统
- **后台异步处理**：登录后立即返回，其他学期课表在后台获取
- **智能缓存管理**：自动清理过期缓存，支持手动清除

### 2. 错误处理

- **避免导航错误**：今日课程完全从缓存推算，不会触发导航错误
- **缓存未命中提示**：当缓存中没有数据时，返回友好的错误提示
- **参数验证**：所有接口都进行参数验证，返回明确的错误信息

### 3. 代码质量

- **类型安全**：使用 TypeScript 类型定义
- **函数封装**：将缓存操作封装为独立函数
- **日志输出**：添加详细的日志输出，便于调试

---

## 使用示例

### 完整使用流程

```javascript
// 1. 登录
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: '学号', password: '密码' })
});
const loginData = await loginResponse.json();
console.log('当前学期课表:', loginData.current_schedule);

// 2. 等待后台获取完成（可选）
await new Promise(resolve => setTimeout(resolve, 5000));

// 3. 获取所有有课学期
const semestersResponse = await fetch('/api/schedule/active-semesters?username=学号');
const semestersData = await semestersResponse.json();
console.log('有课学期:', semestersData.semesters);
console.log('是否来自缓存:', semestersData.from_cache);

// 4. 获取指定学期课表
const scheduleResponse = await fetch('/api/schedule/timetable-by-semester?username=学号&year=2023-2024&term=2');
const scheduleData = await scheduleResponse.json();
console.log('指定学期课表:', scheduleData.courses);
console.log('是否来自缓存:', scheduleData.from_cache);

// 5. 获取今日课程
const todayResponse = await fetch('/api/schedule/todays-courses?username=学号');
const todayData = await todayResponse.json();
console.log('今日课程:', todayData.courses);
console.log('今天是星期', todayData.day_of_week);
console.log('是否来自缓存:', todayData.from_cache);

// 6. 清除缓存（可选）
await fetch('/api/schedule/clear-cache', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: '学号' })
});
```

---

## 注意事项

### 1. 缓存持久性
- 当前缓存是内存级别的，服务重启后会丢失
- 建议在生产环境使用 Redis 等持久化缓存

### 2. 并发安全
- 当前实现使用 Map，在单进程环境下安全
- 多进程环境需要使用共享缓存（如 Redis）

### 3. 缓存一致性
- 如果教务系统数据更新，需要手动清除缓存
- 或等待缓存过期（30分钟）

### 4. 用户名参数
- 所有需要缓存的接口都需要传递 `username` 参数
- 用于区分不同用户的缓存数据

---

## 未来计划

### 短期计划

1. **持久化缓存**
   - 使用 Redis 替代内存缓存
   - 支持跨进程共享缓存

2. **周次计算**
   - 根据学期开始日期计算当前周次
   - 支持单双周课程筛选

3. **缓存预热**
   - 在用户登录前预加载常用数据
   - 减少首次访问延迟

### 长期计划

1. **数据库集成**
   - 将课表数据持久化到数据库
   - 支持历史课表查询

2. **课程提醒**
   - 基于今日课程推送提醒
   - 支持自定义提醒时间

3. **课表导出**
   - 支持导出为 iCal 格式
   - 可导入到日历应用

---

## 测试建议

### 功能测试

1. **登录测试**
   - 测试登录成功后是否返回当前学期课表
   - 检查后台是否自动获取所有学期课表

2. **缓存测试**
   - 测试缓存是否生效（检查 `from_cache` 字段）
   - 测试缓存过期后是否重新获取

3. **今日课程测试**
   - 测试是否能正确推算今日课程
   - 测试不同星期几的课程筛选

4. **清除缓存测试**
   - 测试清除指定用户缓存
   - 测试清除所有缓存

### 性能测试

1. **响应时间**
   - 测试从缓存读取的响应时间
   - 对比从教务系统获取的响应时间

2. **并发测试**
   - 测试多用户同时访问
   - 测试缓存的并发安全性

3. **内存占用**
   - 监控缓存的内存占用
   - 测试大量用户时的内存使用

---

## 贡献者

- **开发者**：Manus AI Agent
- **需求提出**：Jiangnan726

---

## 反馈与支持

如有问题或建议，请在 GitHub 仓库提交 Issue。
