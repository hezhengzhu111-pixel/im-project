/// Web 认证模块的 Riverpod Provider 定义。
///
/// Web 端复用 `im_shared_features` 的认证仓库与状态管理器，确保共享组件（如
/// [ChatPage]）与 Web 专属页面读取到同一个 [AuthNotifier] 实例。
library;

export 'package:im_shared_features/src/auth/presentation/auth_providers.dart'
    show
        authRepositoryProvider,
        authStateProvider,
        currentUserIdProvider,
        isAuthenticatedProvider;
