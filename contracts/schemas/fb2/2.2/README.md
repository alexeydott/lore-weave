# FictionBook 2.2 XML Schemas

These files are vendored from the FictionBook 2.2 schema distribution.

- Canonical source: `http://www.gribuser.ru/xml/fictionbook/2.2/xsd/`
- Mirror requested for discovery: `https://www.beroal.in.ua/human/fiction_book/`
- Retrieved: 2026-08-02. `FictionBook2.2.xsd` uses legacy CR separators upstream and is normalized to LF in this repository.
- Compatibility: FB2 2.2 retains the `http://www.gribuser.ru/xml/fictionbook/2.0` XML namespace. The importer accepts that namespace and implements a bounded, safe import subset; it does not execute or resolve XML DTDs or external entities.

| File | SHA-256 |
| --- | --- |
| `FictionBook2.2.xsd` | `37e8a634d8eddbdb9a4eb8694a7d1dbfa79b2fe61499672af5d53304f3a30365` |
| `FictionBookGenres.xsd` | `a07227518218e081dfb2181316156dfffb19be314352845f0bfaa42733e25353` |
| `FictionBookLang.xsd` | `9f1d18ba2c833fc0e201c9b8a33fe40c67008fa97a98abba69ccec07fd5aaeff` |
| `FictionBookLinks.xsd` | `87f0e010f453bcc64561153de0df9255dd13e1898a18ed65c329d9a8803d3d8e` |

The upstream XSD files retain their original copyright and redistribution notice.
