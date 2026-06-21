/// Web 认证模块的核心状态与状态管理器。
///
/// Web 端直接复用 `im_shared_features` 的实现，避免与共享组件出现两份独立的
/// 认证状态。
library;

export 'package:im_shared_features/src/auth/presentation/auth_provider.dart'
    show AuthNotifier, AuthState;
