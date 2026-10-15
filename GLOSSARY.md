# Bottom Shelf

Domain language for a personal collection of alcoholic beverages and the bottles held in it.

## Language

**Beverage**:
A named alcoholic beverage, such as a specific wine or whisky, represented in a collection.

**Variant**:
A distinguishable version of a beverage; differences in vintage or bottle size distinguish variants. Different variants have separate inventory entries.

**Inventory entry**:
A beverage variant in a collection, together with its number of bottles.
_Avoid_: Bottle when referring to the whole entry

**Bottle**:
An individual physical bottle of a beverage variant. Several bottles can belong to the same inventory entry.
_Avoid_: Inventory entry when referring to one physical bottle

**Stock**:
The bottles currently held for an inventory entry, counted separately as unopened and opened bottles.

**Unopened bottle**:
A bottle whose seal has not been opened and that remains in stock.

**Opened bottle**:
A bottle whose seal has been opened and that still contains beverage. It remains in stock until it is empty or otherwise removed.

**Out-of-stock entry**:
A retained inventory entry with no unopened or opened bottles remaining.

**Beverage type**:
A category describing the kind of beverage, such as red wine, whisky, or gin. Every inventory entry has a beverage type.

**Country of origin**:
A country associated with the origin of a beverage variant. A variant can have more than one country of origin, or none recorded.

**Tag**:
A user-defined label describing a beverage beyond its beverage type, such as a style, flavour, or age statement.
_Avoid_: Beverage type when referring to a freely chosen label

**Last acquired**:
When bottles of an inventory entry were most recently purchased or received. It can be known as a year only or as a complete date, and is separate from vintage.

**Best-before date**:
A stated shelf-life date for a beverage. It is separate from a preferred drinking window.

**Reference price**:
An approximate price per bottle associated with an inventory entry, rather than a record of every purchase.
