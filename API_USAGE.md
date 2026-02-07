# API 使用说明

## 概述

本文档说明了增强后的课表API功能，包括多学期课表获取、缓存管理和基于缓存的今日课程推算。

## 主要功能

### 1. 多学期课表自动获取

登录成功后，系统会自动：
- 立即获取当前学期课表并缓存
- 在后台异步获取所有学年学期的课表
- 自动识别并缓存有课表的学期
- 将有课表的学期放入可选列表

### 2. 智能缓存机制

- 所有课表数据都会缓存在内存中
- 缓存有效期：30分钟
- 优先从缓存读取，避免重复访问教务系统
- 支持按用户和学期分别缓存

### 3. 今日课程推算

- 从缓存的课表数据中推算今日课程
- 不再重新访问课表页面，避免导航错误
- 根据今天的日期自动筛选课程

## API 接口

### 1. 登录

**POST** `/api/auth/login`

**请求体：**
```json
{
  "username": "学号",
  "password": "密码"
}
```

**响应：**
```json
{
  "success": true,
  "message": "登录成功",
  "username": "学号",
  "current_schedule": {
    "courses": [...],
    "semester_info": {
      "school_year": "2024-2025",
      "semester": "1",
      "raw_text": "2024-2025学年 第1学期"
    }
  }
}
```

**说明：**
- 登录成功后会立即返回当前学期课表
- 同时在后台异步获取所有学期的课表并缓存

---

### 2. 获取有课表的学期列表

**GET** `/api/schedule/active-semesters?username={学号}`

**查询参数：**
- `username`: 学号（必填）

**响应：**
```json
{
  "success": true,
  "semesters": [
    {
      "year": "2024-2025",
      "term": "1",
      "label": "2024-2025 第1学期",
      "is_current": true
    },
    {
      "year": "2023-2024",
      "term": "2",
      "label": "2023-2024 第2学期",
      "is_current": false
    }
  ],
  "from_cache": true
}
```

**说明：**
- 优先从缓存读取
- `from_cache` 字段表示数据是否来自缓存

---

### 3. 获取指定学期的课表

**GET** `/api/schedule/timetable-by-semester?username={学号}&year={学年}&term={学期}`

**查询参数：**
- `username`: 学号（必填）
- `year`: 学年，如 "2024-2025"（必填）
- `term`: 学期，如 "1"（必填）

**响应：**
```json
{
  "success": true,
  "courses": [
    {
      "course_id": "课程ID",
      "course_code": "课程代码",
      "course_name": "课程名称",
      "semester": "2024-2025-1",
      "teacher": "教师姓名",
      "location": "上课地点",
      "time_slot": "时间段",
      "day_of_week": 1,
      "is_single_week": null,
      "period": "1-2",
      "period_time": "08:00-09:35",
      "week_range": "1-16"
    }
  ],
  "semester_info": {
    "school_year": "2024-2025",
    "semester": "1"
  },
  "from_cache": true
}
```

**说明：**
- 优先从缓存读取
- 缓存未命中时会从教务系统获取并缓存

---

### 4. 获取当前学期课表

**GET** `/api/schedule/timetable?username={学号}`

**查询参数：**
- `username`: 学号（必填）

**响应：**
```json
{
  "success": true,
  "courses": [...],
  "semester_info": {...},
  "from_cache": true
}
```

**说明：**
- 返回缓存中的当前学期课表
- 如果缓存中没有数据，会从教务系统获取

---

### 5. 获取今日课程

**GET** `/api/schedule/todays-courses?username={学号}&semester={学期键值}`

**查询参数：**
- `username`: 学号（必填）
- `semester`: 学期键值，如 "2024-2025_1"（可选，不填则使用最新缓存的学期）

**响应：**
```json
{
  "success": true,
  "courses": [
    {
      "course_name": "高等数学",
      "teacher": "张三",
      "location": "教学楼101",
      "period": "1-2",
      "period_time": "08:00-09:35",
      "day_of_week": 1
    }
  ],
  "total": 3,
  "day_of_week": 1,
  "semester": "2024-2025_1",
  "from_cache": true
}
```

**说明：**
- **完全从缓存中推算，不会重新访问课表页面**
- 根据今天的日期（星期几）自动筛选课程
- 避免了 "Execution context was destroyed" 错误

---

### 6. 清除缓存

**POST** `/api/schedule/clear-cache`

**请求体：**
```json
{
  "username": "学号"  // 可选，不填则清除所有缓存
}
```

**响应：**
```json
{
  "success": true,
  "message": "缓存已清除"
}
```

**说明：**
- 如果指定 `username`，只清除该用户的缓存
- 如果不指定，清除所有用户的缓存

---

### 7. 获取学年学期选项

**GET** `/api/schedule/semester-options`

**响应：**
```json
{
  "success": true,
  "year_options": [
    {
      "value": "2024",
      "text": "2024-2025",
      "selected": true
    }
  ],
  "term_options": [
    {
      "value": "3",
      "text": "1",
      "selected": true
    }
  ],
  "current_year": "2024-2025",
  "current_term": "1"
}
```

---

### 8. 退出登录

**POST** `/api/auth/logout`

**响应：**
```json
{
  "success": true,
  "message": "已退出登录"
}
```

**说明：**
- 关闭浏览器实例
- 不会清除缓存，如需清除请调用清除缓存接口

---

## 缓存机制详解

### 缓存结构

```
scheduleCache: Map<username, Map<semesterKey, scheduleData>>
  ├─ username1
  │   ├─ "2024-2025_1" -> { courses, semester_info, timestamp }
  │   └─ "2023-2024_2" -> { courses, semester_info, timestamp }
  └─ username2
      └─ "2024-2025_1" -> { courses, semester_info, timestamp }

activeSemestersCache: Map<username, { semesters, timestamp }>
  ├─ username1 -> { semesters: [...], timestamp }
  └─ username2 -> { semesters: [...], timestamp }
```

### 缓存策略

1. **写入时机**
   - 登录成功后立即缓存当前学期课表
   - 后台异步获取并缓存所有学期课表
   - 手动获取课表时缓存结果

2. **读取策略**
   - 优先从缓存读取
   - 检查缓存是否过期（30分钟）
   - 缓存未命中或过期时从教务系统获取

3. **过期策略**
   - 缓存有效期：30分钟
   - 过期后自动删除
   - 可手动清除缓存

### 学期键值格式

学期键值格式为：`{学年}_{学期}`

示例：
- `2024-2025_1` 表示 2024-2025学年第1学期
- `2023-2024_2` 表示 2023-2024学年第2学期

---

## 使用流程

### 典型使用场景

```
1. 用户登录
   POST /api/auth/login
   ↓
   立即返回当前学期课表
   ↓
   后台自动获取所有学期课表

2. 查看有哪些学期
   GET /api/schedule/active-semesters?username=xxx
   ↓
   返回所有有课表的学期列表（从缓存）

3. 切换学期查看课表
   GET /api/schedule/timetable-by-semester?username=xxx&year=2023-2024&term=2
   ↓
   返回指定学期课表（从缓存）

4. 查看今日课程
   GET /api/schedule/todays-courses?username=xxx
   ↓
   从缓存中推算今日课程（不访问教务系统）
```

---

## 错误处理

### 常见错误

1. **缺少用户名参数**
```json
{
  "success": false,
  "error": "缺少用户名参数"
}
```

2. **未找到缓存数据**
```json
{
  "success": false,
  "error": "未找到缓存的课表数据，请先登录或刷新课表"
}
```

3. **登录失败**
```json
{
  "success": false,
  "error": "登录失败，请检查学号和密码"
}
```

---

## 性能优化

### 优化点

1. **减少教务系统访问**
   - 登录后一次性获取所有学期课表
   - 所有后续请求优先从缓存读取
   - 避免重复的网络请求

2. **避免导航错误**
   - 今日课程完全从缓存推算
   - 不再重新访问课表页面
   - 解决了 "Execution context was destroyed" 错误

3. **后台异步处理**
   - 登录后立即返回当前学期课表
   - 其他学期课表在后台异步获取
   - 不阻塞用户操作

4. **智能缓存管理**
   - 30分钟缓存有效期
   - 自动清理过期缓存
   - 支持手动清除缓存

---

## 注意事项

1. **缓存是内存级别的**
   - 服务重启后缓存会丢失
   - 建议在生产环境使用 Redis 等持久化缓存

2. **并发安全**
   - 当前实现使用 Map，在单进程环境下安全
   - 多进程环境需要使用共享缓存（如 Redis）

3. **缓存一致性**
   - 如果教务系统数据更新，需要手动清除缓存
   - 或等待缓存过期（30分钟）

4. **用户名参数**
   - 所有需要缓存的接口都需要传递 `username` 参数
   - 用于区分不同用户的缓存数据

---

## 未来改进

1. **持久化缓存**
   - 使用 Redis 替代内存缓存
   - 支持跨进程共享缓存
   - 服务重启后缓存不丢失

2. **周次计算**
   - 根据学期开始日期计算当前周次
   - 支持单双周课程筛选
   - 更精确的今日课程推算

3. **缓存预热**
   - 在用户登录前预加载常用数据
   - 减少首次访问延迟

4. **缓存统计**
   - 记录缓存命中率
   - 监控缓存使用情况
   - 优化缓存策略
