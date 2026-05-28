enum Breakpoint {
  compact, // < 600px
  medium, // 600–899px
  expanded, // 900–1199px
  large; // >= 1200px

  static Breakpoint fromWidth(double width) {
    if (width < 600) return Breakpoint.compact;
    if (width < 900) return Breakpoint.medium;
    if (width < 1200) return Breakpoint.expanded;
    return Breakpoint.large;
  }

  T value<T>({required T compact, T? medium, T? expanded, T? large}) {
    switch (this) {
      case Breakpoint.compact:
        return compact;
      case Breakpoint.medium:
        return medium ?? compact;
      case Breakpoint.expanded:
        return expanded ?? medium ?? compact;
      case Breakpoint.large:
        return large ?? expanded ?? medium ?? compact;
    }
  }
}
