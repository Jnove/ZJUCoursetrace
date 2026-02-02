# ZJU 课表助手 - 集成文档

## 项目概述

本项目是一个完整的浙江大学课表管理移动应用，集成了 CAS 认证、课表数据获取、单双周区分等功能。

## 核心功能

### 1. CAS 认证系统

**文件位置**: `server/_core/cas-service.ts`

- 使用浙江大学 CAS 系统进行身份验证
- 支持用户名和密码登录
- 自动获取用户的课表数据
- 集成了 Python 脚本的认证逻辑

**主要方法**:
- `login(username, password)` - 进行 CAS 认证
- `getSchedule(username)` - 获取用户课表

### 2. 课表数据管理

**文件位置**: `server/_core/schedule-router.ts`

提供以下 API 端点:

- `schedule.getCourses` - 获取用户的课程列表
- `schedule.refreshSchedule` - 刷新课表（调用 CAS 认证）
- `schedule.getCoursesByWeekType` - 按周类型过滤课程
- `schedule.getCoursesByDay` - 获取特定日期的课程

### 3. 数据库设计

**文件位置**: `drizzle/schema.ts`

#### 课程表 (courses)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| userId | integer | 用户 ID |
| courseId | string | 课程 ID |
| courseCode | string | 课程代码 |
| courseName | string | 课程名称 |
| semester | string | 学期 |
| teacher | string | 授课教师 |
| location | string | 上课地点 |
| timeSlot | string | 时间段 |
| dayOfWeek | integer | 星期几 (1-7) |
| isSingleWeek | string | 周类型 (single/double/both) |
| period | integer | 课程节次 |
| periodTime | string | 具体时间 |
| weekRange | string | 周次范围 |
| credit | number | 学分 |

#### 课表缓存表 (scheduleCache)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| userId | integer | 用户 ID |
| semester | string | 学期 |
| data | text | 原始课表数据 (JSON) |
| updatedAt | timestamp | 更新时间 |

### 4. 前端界面

#### 首页 (`app/(tabs)/index.tsx`)

- 显示应用介绍和功能特性
- 显示当前登录用户信息
- 显示课程统计
- 提供退出登录功能

#### 课表页面 (`app/(tabs)/schedule.tsx`)

- 显示周次选择器（上一周/下一周）
- 显示当前周次和周类型（单周/双周）
- 提供课程过滤（全部/单周/双周）
- 展示课程表格

#### 课程详情页面 (`app/course-detail.tsx`)

- 显示课程名称
- 显示授课教师
- 显示上课地点
- 显示周次类型

#### 课表组件 (`components/schedule-table.tsx`)

- 响应式课表显示
- 支持跨行课程显示
- 显示单双周标记
- 点击课程查看详情

### 5. 前端状态管理

#### 认证上下文 (`lib/auth-context.tsx`)

- 管理用户登录状态
- 处理 CAS 认证流程
- 管理用户 token 和用户名
- 提供登出功能

#### 课表上下文 (`lib/schedule-context.tsx`)

- 管理课程数据
- 支持周次过滤
- 支持周类型过滤
- 提供课程查询功能

## 单双周处理

### 数据模型

课程的 `isSingleWeek` 字段可以有以下值:

- `"single"` - 仅在单数周（1、3、5、7...）上课
- `"double"` - 仅在双数周（2、4、6、8...）上课
- `"both"` - 每周都上课

### 前端过滤逻辑

在 `schedule-context.tsx` 中的 `getCoursesForWeek` 方法实现了过滤逻辑:

```typescript
// 当选择"单周"过滤时
if (state.weekType === "single") {
  filtered = filtered.filter((course) => 
    course.isSingleWeek === "single" || course.isSingleWeek === "both"
  );
  // 仅在单数周显示
  if (week % 2 === 0) {
    filtered = filtered.filter((course) => course.isSingleWeek !== "single");
  }
}
```

### 前端显示

- 课表中的每个课程都会显示周类型标记（"单"或"双"）
- 用户可以通过过滤按钮查看特定类型的课程
- 系统自动根据当前周次显示相应的课程

## 集成指南

### 后端集成

1. **CAS 认证配置**

   在 `server/_core/cas-service.ts` 中配置 CAS 服务器地址:

   ```typescript
   const CAS_SERVER_URL = "https://cas.zju.edu.cn";
   ```

2. **API 路由注册**

   在 `server/routers.ts` 中已自动注册课表路由:

   ```typescript
   import { scheduleRouter } from "./_core/schedule-router";
   
   export const appRouter = router({
     schedule: scheduleRouter,
     // ...
   });
   ```

3. **数据库迁移**

   运行以下命令生成并执行数据库迁移:

   ```bash
   pnpm db:push
   ```

### 前端集成

1. **提供者设置**

   在 `app/_layout.tsx` 中已配置提供者:

   ```typescript
   <AuthProvider>
     <ScheduleProvider>
       {/* 应用内容 */}
     </ScheduleProvider>
   </AuthProvider>
   ```

2. **使用 Hooks**

   在组件中使用认证和课表 hooks:

   ```typescript
   const { state: authState, signIn } = useAuth();
   const { state: scheduleState, setCurrentWeek } = useSchedule();
   ```

## 环境配置

### 必需的环境变量

- `DATABASE_URL` - 数据库连接字符串
- `NODE_ENV` - 运行环境 (development/production)

### 可选的环境变量

- `CAS_SERVER_URL` - CAS 服务器地址（默认: https://cas.zju.edu.cn）
- `API_BASE_URL` - API 基础 URL

## 开发指南

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test

# 类型检查
pnpm check
```

### 项目结构

```
.
├── app/                    # 前端应用
│   ├── (tabs)/            # 标签栏页面
│   ├── _layout.tsx        # 根布局
│   └── course-detail.tsx  # 课程详情
├── components/            # React 组件
│   ├── schedule-table.tsx # 课表组件
│   └── screen-container.tsx
├── lib/                   # 工具库
│   ├── auth-context.tsx   # 认证上下文
│   ├── schedule-context.tsx # 课表上下文
│   └── trpc.ts            # tRPC 客户端
├── server/                # 后端服务
│   ├── _core/
│   │   ├── cas-service.ts # CAS 认证服务
│   │   └── schedule-router.ts # 课表 API 路由
│   ├── db.ts              # 数据库操作
│   └── routers.ts         # 路由注册
├── drizzle/               # 数据库
│   └── schema.ts          # 数据库模式
└── assets/                # 资源文件
    └── images/            # 应用图标
```

## 故障排除

### CAS 认证失败

- 检查用户名和密码是否正确
- 确保网络连接正常
- 检查 CAS 服务器是否可访问

### 课表无法加载

- 检查数据库连接是否正常
- 确保用户已成功认证
- 检查服务器日志中的错误信息

### 单双周显示错误

- 确保课程数据中的 `isSingleWeek` 字段值正确
- 检查周次过滤逻辑是否正确
- 验证当前周次是否正确设置

## 未来改进

- [ ] 添加课程提醒功能
- [ ] 支持课程导出（iCal 格式）
- [ ] 添加课程笔记功能
- [ ] 支持课程共享
- [ ] 添加成绩查询功能
- [ ] 支持多学期课表切换
- [ ] 添加离线模式支持

## 许可证

MIT License

## 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。
