# ZJU 课表助手 - 功能说明

## 应用特性

### 🔐 CAS 认证

**功能**: 使用浙江大学 CAS 系统进行安全登录

- 支持学号和密码登录
- 自动获取用户身份验证
- 安全的 token 管理
- 支持登出功能

**实现位置**: 
- 后端: `server/_core/cas-service.ts`
- 前端: `lib/auth-context.tsx`

### 📚 课表显示

**功能**: 完整的课程表展示

- 按周次显示课程（1-20 周）
- 按日期显示课程（周一至周日）
- 按时间段显示课程（8 个时间段）
- 支持跨行课程显示
- 响应式布局设计

**实现位置**:
- 组件: `components/schedule-table.tsx`
- 页面: `app/(tabs)/schedule.tsx`

### 🔄 周次切换

**功能**: 灵活的周次导航

- 上一周/下一周按钮
- 当前周次显示
- 单周/双周标识
- 周次范围验证（1-20 周）

**实现位置**: `app/(tabs)/schedule.tsx`

### 📋 单双周区分

**功能**: 智能的课程过滤和显示

#### 周类型定义

| 类型 | 说明 | 显示规则 |
|------|------|--------|
| 单周 | 仅在单数周上课 | 第 1、3、5、7... 周显示 |
| 双周 | 仅在双数周上课 | 第 2、4、6、8... 周显示 |
| 单双周 | 每周都上课 | 所有周都显示 |

#### 过滤选项

用户可以通过三个过滤按钮查看不同类型的课程:

1. **全部课程** - 显示该周的所有课程
2. **单周** - 仅显示单周课程（如果当前是双周，则不显示任何课程）
3. **双周** - 仅显示双周课程（如果当前是单周，则不显示任何课程）

#### 实现逻辑

```typescript
// 获取特定周的课程
getCoursesForWeek(week: number): Course[] {
  let filtered = courses.filter(
    course => course.weekStart <= week && week <= course.weekEnd
  );

  // 应用周类型过滤
  if (weekType === "single") {
    filtered = filtered.filter(
      course => course.isSingleWeek === "single" || course.isSingleWeek === "both"
    );
    // 仅在单数周显示
    if (week % 2 === 0) {
      filtered = filtered.filter(
        course => course.isSingleWeek !== "single"
      );
    }
  }
  
  return filtered;
}
```

**实现位置**: `lib/schedule-context.tsx`

### 📖 课程详情

**功能**: 查看课程详细信息

- 课程名称
- 授课教师
- 上课地点
- 周次类型
- 周次范围说明

**实现位置**: `app/course-detail.tsx`

### 💾 数据持久化

**功能**: 本地数据缓存和数据库存储

- 用户信息本地存储
- 课程数据数据库存储
- 课表缓存管理
- 自动同步更新

**实现位置**:
- 本地存储: `lib/auth-context.tsx`, `lib/schedule-context.tsx`
- 数据库: `server/db.ts`

## 用户流程

### 登录流程

```
1. 用户打开应用
2. 输入学号和密码
3. 系统通过 CAS 认证
4. 自动获取用户课表
5. 保存 token 和用户信息
6. 进入首页
```

### 查看课表流程

```
1. 用户进入"课表"标签页
2. 系统显示当前周的课程
3. 用户可以：
   - 切换周次（上一周/下一周）
   - 过滤课程类型（全部/单周/双周）
   - 点击课程查看详情
```

### 课程详情流程

```
1. 用户在课表中点击课程
2. 进入课程详情页面
3. 显示课程的详细信息
4. 用户可以返回课表
```

## API 接口

### 认证相关

#### 登出
```
POST /api/trpc/auth.logout
```

### 课表相关

#### 获取课程列表
```
GET /api/trpc/schedule.getCourses?input={"semester":"2024-2025-1"}
```

**响应**:
```json
{
  "success": true,
  "courses": [
    {
      "id": 1,
      "courseId": "CS101",
      "courseName": "数据结构",
      "teacher": "张三",
      "location": "教室A101",
      "dayOfWeek": 1,
      "isSingleWeek": "both",
      ...
    }
  ]
}
```

#### 刷新课表
```
POST /api/trpc/schedule.refreshSchedule
```

**请求体**:
```json
{
  "username": "3210101001",
  "password": "password",
  "semester": "2024-2025-1"
}
```

**响应**:
```json
{
  "success": true,
  "message": "Schedule refreshed successfully",
  "courseCount": 15
}
```

#### 按周类型获取课程
```
GET /api/trpc/schedule.getCoursesByWeekType?input={"semester":"2024-2025-1","weekType":"single"}
```

#### 按日期获取课程
```
GET /api/trpc/schedule.getCoursesByDay?input={"dayOfWeek":1,"semester":"2024-2025-1"}
```

## 数据模型

### 课程对象

```typescript
interface Course {
  id: string;
  name: string;
  teacher: string;
  classroom: string;
  dayOfWeek: number;        // 1-7 (周一-周日)
  startPeriod: number;      // 1-8
  endPeriod: number;        // 1-8
  weekStart: number;        // 1-20
  weekEnd: number;          // 1-20
  color: string;            // 十六进制颜色
  isSingleWeek?: "single" | "double" | "both";
}
```

### 用户对象

```typescript
interface User {
  id: number;
  username: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## 性能优化

### 前端优化

- 使用 React Context 避免不必要的 re-render
- 课表组件使用 FlatList 优化列表性能
- 本地缓存减少 API 调用

### 后端优化

- 数据库查询使用索引
- 缓存课表数据减少重复获取
- 异步处理 CAS 认证请求

## 安全性考虑

### 认证安全

- 使用 HTTPS 加密通信
- Token 存储在 AsyncStorage（移动应用）
- 支持自动登出

### 数据安全

- 用户密码不存储在本地
- 敏感数据加密存储
- 定期清理过期缓存

## 浏览器兼容性

- iOS 12+
- Android 8+
- Web 浏览器（Chrome、Safari、Firefox）

## 移动应用特性

### iOS

- 支持 iPhone 和 iPad
- 支持 Face ID / Touch ID（未来功能）
- 支持 Dark Mode

### Android

- 支持 Android 8+
- 支持 Adaptive Icon
- 支持 Dark Mode

## 无障碍支持

- 支持屏幕阅读器
- 合理的颜色对比度
- 清晰的按钮标签
- 键盘导航支持

## 国际化

当前支持语言: 中文（简体）

未来计划: 英文、日文等

## 更新日志

### v1.0.0 (2026-02-02)

**新增功能**:
- CAS 认证系统
- 课表显示和管理
- 单双周区分和过滤
- 课程详情查看
- 本地数据缓存

**已知问题**: 无

**改进方向**:
- 添加课程提醒
- 支持课程导出
- 添加笔记功能
