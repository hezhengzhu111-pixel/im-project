class PageMeta {
  final String title;
  final String description;
  final String? canonicalPath;
  final OgMeta? og;
  final TwitterMeta? twitter;

  const PageMeta({
    required this.title,
    required this.description,
    this.canonicalPath,
    this.og,
    this.twitter,
  });
}

class OgMeta {
  final String? title;
  final String? description;
  final String? image;
  final String? type;

  const OgMeta({this.title, this.description, this.image, this.type});
}

class TwitterMeta {
  final String? card;
  final String? title;
  final String? description;
  final String? image;

  const TwitterMeta({this.card, this.title, this.description, this.image});
}
